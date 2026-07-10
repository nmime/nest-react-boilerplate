import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { z } from "zod";

export const rbacPlugin: BetterAuthPlugin = {
  id: "rbac",
  init: () => {},
  schema: {
    user: {
      fields: {
        roles: { type: "json", input: false },
        permissions: { type: "json", input: false },
        status: { type: "string", defaultValue: "active" },
        locale: { type: "string", defaultValue: "en" },
        theme: { type: "string", defaultValue: "system" },
      },
    },
  },
  endpoints: {
    checkPermission: createAuthEndpoint(
      "/check-permission",
      {
        method: "POST",
        body: z.object({ permission: z.string() }),
      },
      async (req) => {
        const session = await getSessionFromCtx(req);
        if (!session) throw new Error("Unauthorized");
        const permissions: string[] = (session.user as any).permissions || [];
        return {
          hasPermission: permissions.includes(req.body.permission),
          userPermissions: permissions,
        };
      },
    ),
    setPreferences: createAuthEndpoint(
      "/set-preferences",
      {
        method: "POST",
        body: z.object({ locale: z.string().optional(), theme: z.string().optional() }),
      },
      async (req) => {
        const session = await getSessionFromCtx(req);
        if (!session) throw new Error("Unauthorized");
        const updates: Record<string, any> = {};
        if (req.body.locale !== undefined) updates.locale = req.body.locale;
        if (req.body.theme !== undefined) updates.theme = req.body.theme;
        if (Object.keys(updates).length === 0) return session.user;
        const updated = await req.context.internalAdapter.updateUser(session.user.id, updates as any);
        return { ...session.user, ...updates };
      },
    ),
    refreshPermissions: createAuthEndpoint(
      "/refresh-permissions",
      { method: "POST" },
      async (req) => {
        const session = await getSessionFromCtx(req);
        if (!session) throw new Error("Unauthorized");
        // TODO: wire to existing MikroORM auth_role_permissions tables
        const userRecord = await req.context.internalAdapter.findUserById(session.user.id);
        return {
          roles: (userRecord as any)?.roles || [],
          permissions: (userRecord as any)?.permissions || [],
        };
      },
    ),
  },
};
