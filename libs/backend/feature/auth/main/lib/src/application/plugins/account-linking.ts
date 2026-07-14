import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api';
import { z } from 'zod';
import { createHash, randomBytes } from 'node:crypto';
import { DefaultAuthTenantId } from '@app/backend-feature-auth-shared';

interface LinkToken {
  tenantId: string;
  userId: string;
  provider: string;
  purpose: string;
  tokenHash: string;
  deepLinkMetadata: Record<string, string>;
  expiresAt: Date;
}

const linkTokens: LinkToken[] = [];

/** Shape of account objects returned by better-auth's internalAdapter.findAccounts. */
interface LinkableAccount {
  id: string;
  providerId: string;
  accountId: string;
  providerSubject?: string;
  channel?: string;
}

export interface AccountLinkingPluginOptions {
  allowedReturnUrls?: string[];
  linkTokenTtlSeconds?: number;
}

export const accountLinkingPlugin = (options: AccountLinkingPluginOptions = {}): BetterAuthPlugin => ({
  id: 'account-linking',
  init: () => {},
  endpoints: {
    createLinkToken: createAuthEndpoint(
      '/account-linking/create-link-token',
      {
        method: 'POST',
        body: z.object({
          provider: z.string(),
          intent: z.string().optional(),
          returnUrl: z.string().optional(),
        }),
      },
      async (req) => {
        const session = await getSessionFromCtx(req);
        if (!session) {
          throw new Error('Unauthorized');
        }
        const { provider, intent = 'link', returnUrl } = req.body;
        const allowedUrls = options.allowedReturnUrls || [];
        if (returnUrl && allowedUrls.length && !allowedUrls.some((u) => returnUrl.startsWith(u))) {
          throw new Error('return_url_not_allowed');
        }
        removeExpiredLinkTokens();
        const token = randomBytes(32).toString('base64url');
        const tokenHash = hashLinkToken(token);
        const ttl = options.linkTokenTtlSeconds || 600;
        const expiresAt = new Date(Date.now() + ttl * 1000);
        // Link tokens are stored in-memory for the boilerplate.
        // In production with multiple instances, replace this with a Redis-backed
        // store or MikroORM/em.nativeInsert into a dedicated link_tokens table.
        linkTokens.push({
          tenantId: ((session.user as Record<string, unknown>).tenantId as string) || DefaultAuthTenantId,
          userId: session.user.id,
          provider,
          purpose: intent,
          tokenHash,
          deepLinkMetadata: returnUrl ? { returnUrl } : {},
          expiresAt,
        });
        return { token, expiresAt: expiresAt.toISOString(), provider, intent };
      },
    ),
    consumeLinkToken: createAuthEndpoint(
      '/account-linking/consume-link-token',
      {
        method: 'POST',
        body: z.object({ token: z.string().min(1) }),
      },
      async (req) => {
        const session = await getSessionFromCtx(req);
        if (!session) {
          throw new Error('Unauthorized');
        }

        removeExpiredLinkTokens();
        const tokenIndex = linkTokens.findIndex((linkToken) => linkToken.tokenHash === hashLinkToken(req.body.token));
        if (tokenIndex < 0) {
          throw new Error('link_token_invalid_or_expired');
        }

        const [linkToken] = linkTokens.splice(tokenIndex, 1);
        const tenantId =
          ((session.user as Record<string, unknown>).tenantId as string | undefined) ?? DefaultAuthTenantId;
        if (!linkToken || linkToken.userId !== session.user.id || linkToken.tenantId !== tenantId) {
          throw new Error('link_token_owner_mismatch');
        }

        return {
          provider: linkToken.provider,
          purpose: linkToken.purpose,
          deepLinkMetadata: linkToken.deepLinkMetadata,
        };
      },
    ),
    listProviderIdentities: createAuthEndpoint(
      '/account-linking/provider-identities',
      { method: 'GET' },
      async (req) => {
        const session = await getSessionFromCtx(req);
        if (!session) {
          throw new Error('Unauthorized');
        }
        // Use the built-in listUserAccounts via internalAdapter
        const accounts = (await req.context.internalAdapter.findAccounts(session.user.id)) as unknown as
          LinkableAccount[] | undefined;
        return (accounts || []).map((acc: LinkableAccount) => ({
          id: acc.id,
          provider: acc.providerId,
          providerSubject: acc.providerSubject || acc.accountId,
          channel: acc.channel || null,
        }));
      },
    ),
    unlinkProviderIdentity: createAuthEndpoint(
      '/account-linking/provider-identities/:identityId',
      {
        method: 'DELETE',
        query: z.object({ identityId: z.string() }),
      },
      async (req) => {
        const session = await getSessionFromCtx(req);
        if (!session) {
          throw new Error('Unauthorized');
        }
        const identityId = req.params.identityId;
        const userId = session.user.id;

        // Check user has other auth methods
        const accounts = await req.context.internalAdapter.findAccounts(userId);
        if ((accounts || []).length <= 1) {
          throw new Error('last_method_unlink_forbidden');
        }
        // Use the built-in unlinkAccount endpoint logic
        await req.context.adapter.delete({
          model: 'account',
          where: [{ field: 'id', value: identityId }],
        });
        return { unlinked: true };
      },
    ),
  },
});

function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function removeExpiredLinkTokens(now = new Date()): void {
  for (let index = linkTokens.length - 1; index >= 0; index -= 1) {
    const linkToken = linkTokens[index];
    if (linkToken && linkToken.expiresAt.getTime() < now.getTime()) {
      linkTokens.splice(index, 1);
    }
  }
}
