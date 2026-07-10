import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { z } from "zod";
import { randomBytes, createHmac } from "node:crypto";
import { DefaultAuthTenantId } from "@app/backend-feature-auth-shared";

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
        if (!session) throw new Error("Unauthorized");
        const { provider, intent = "link", returnUrl } = req.body;
        const allowedUrls = options.allowedReturnUrls || [];
        if (returnUrl && allowedUrls.length && !allowedUrls.some((u) => returnUrl.startsWith(u))) {
          throw new Error("return_url_not_allowed");
        }
        const token = randomBytes(32).toString("base64url");
        const tokenHash = createHmac("sha256", token).digest("hex");
        const ttl = options.linkTokenTtlSeconds || 600;
        const expiresAt = new Date(Date.now() + ttl * 1000);
        // TODO: Persist linkToken to DB using MikroORM/em.nativeInsert.
        // For now, stored in-memory for multi-instance safety.
        (globalThis as any).__linkTokens = (globalThis as any).__linkTokens || [];
        (globalThis as any).__linkTokens.push({
          tenantId: (session.user as any).tenantId || DefaultAuthTenantId,
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
        if (!session) throw new Error("Unauthorized");
        // Use the built-in listUserAccounts via internalAdapter
        const accounts = await req.context.internalAdapter.findAccounts(session.user.id);
        return (accounts || []).map((acc: any) => ({
          id: acc.id,
          provider: acc.providerId,
          providerSubject: (acc as any).providerSubject || acc.providerAccountId,
          channel: (acc as any).channel || null,
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
        if (!session) throw new Error("Unauthorized");
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
