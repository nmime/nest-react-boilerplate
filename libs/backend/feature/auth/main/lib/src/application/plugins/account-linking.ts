import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { z } from "zod";
import { randomBytes, createHmac } from "node:crypto";
import { DefaultAuthTenantId } from "@app/backend-feature-auth-shared";

/** Extended globalThis for in-memory link-token storage (dev-only; production should use a DB). */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- extending globalThis
  namespace NodeJS {
    interface Global {
      __linkTokens: Array<{
        tenantId: string;
        userId: string;
        provider: string;
        purpose: string;
        tokenHash: string;
        deepLinkMetadata: Record<string, string>;
        expiresAt: Date;
      }>;
    }
  }
}

/** Shape of account objects returned by better-auth's internalAdapter.findAccounts. */
interface LinkableAccount {
  id: string;
  providerId: string;
  providerAccountId: string;
  providerSubject?: string;
  channel?: string;
}

export interface AccountLinkingPluginOptions {
  allowedReturnUrls?: string[];
  linkTokenTtlSeconds?: number;
}

export const accountLinkingPlugin = (options: AccountLinkingPluginOptions = {}): BetterAuthPlugin => ({
  id: "account-linking",
  init: () => {},
  endpoints: {
    createLinkToken: createAuthEndpoint(
      "/account-linking/create-link-token",
      {
        method: "POST",
        body: z.object({
          provider: z.string(),
          intent: z.string().optional(),
          returnUrl: z.string().optional(),
        }),
      },
      async (req) => {
        const session = await getSessionFromCtx(req);
        if (!session) {throw new Error("Unauthorized");}
        const { provider, intent = "link", returnUrl } = req.body;
        const allowedUrls = options.allowedReturnUrls || [];
        if (returnUrl && allowedUrls.length && !allowedUrls.some((u) => returnUrl.startsWith(u))) {
          throw new Error("return_url_not_allowed");
        }
        const token = randomBytes(32).toString("base64url");
        const tokenHash = createHmac("sha256", token).digest("hex");
        const ttl = options.linkTokenTtlSeconds || 600;
        const expiresAt = new Date(Date.now() + ttl * 1000);
        // Link tokens are stored in-memory via globalThis for the boilerplate.
        // In production with multiple instances, replace this with a Redis-backed
        // store or MikroORM/em.nativeInsert into a dedicated link_tokens table.
        globalThis.__linkTokens = globalThis.__linkTokens || [];
        globalThis.__linkTokens.push({
          tenantId: (session.user as Record<string, unknown>).tenantId as string || DefaultAuthTenantId,
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
    listProviderIdentities: createAuthEndpoint(
      "/account-linking/provider-identities",
      { method: "GET" },
      async (req) => {
        const session = await getSessionFromCtx(req);
        if (!session) {throw new Error("Unauthorized");}
        // Use the built-in listUserAccounts via internalAdapter
        const accounts = (await req.context.internalAdapter.findAccounts(session.user.id)) as LinkableAccount[] | undefined;
        return (accounts || []).map((acc: LinkableAccount) => ({
          id: acc.id,
          provider: acc.providerId,
          providerSubject: acc.providerSubject || acc.providerAccountId,
          channel: acc.channel || null,
        }));
      },
    ),
    unlinkProviderIdentity: createAuthEndpoint(
      "/account-linking/provider-identities/:identityId",
      {
        method: "DELETE",
        query: z.object({ identityId: z.string() }),
      },
      async (req) => {
        const session = await getSessionFromCtx(req);
        if (!session) {throw new Error("Unauthorized");}
        const identityId = req.params.identityId;
        const userId = session.user.id;

        // Check user has other auth methods
        const accounts = await req.context.internalAdapter.findAccounts(userId);
        if ((accounts || []).length <= 1) {
          throw new Error("last_method_unlink_forbidden");
        }
        // Use the built-in unlinkAccount endpoint logic
        await req.context.adapter.delete({
          model: "account",
          where: [{ field: "id", value: identityId }],
        });
        return { unlinked: true };
      },
    ),
  },
});
