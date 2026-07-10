import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { z } from "zod";
import { DefaultAuthTenantId } from "@app/backend-feature-auth-shared";

export const multiTenantPlugin: BetterAuthPlugin = {
  id: "multi-tenant",
  init: () => {},
  hooks: {
    after: [
      {
        matcher: (ctx) => {
          const p = ctx.path || "";
          return p.startsWith("/sign-up") || p.startsWith("/sign-in");
        },
        handler: createAuthMiddleware(async (ctx) => ctx),
      },
    ],
  },
  endpoints: {
    getTenantSession: createAuthEndpoint(
      "/get-tenant-session",
      { method: "GET" },
      async (req) => {
        const session = await getSessionFromCtx(req);
        if (!session) return null;
        const s = session;
        return {
          user: {
            ...s.user,
            tenantId: (s.user as any).tenantId || DefaultAuthTenantId,
            roles: (s.user as any).roles || [],
            permissions: (s.user as any).permissions || [],
          },
          expiresAt: s.session?.expiresAt || new Date(Date.now() + 3600_000),
        };
      },
    ),
  },
};
