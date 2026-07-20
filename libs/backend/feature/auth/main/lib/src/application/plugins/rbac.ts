import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint, getSessionFromCtx } from 'better-auth/api';
import * as z from 'zod';

/** User updates that better-auth's internalAdapter.updateUser accepts. */
type UserUpdateFields = Record<string, string>;

export const rbacPlugin: BetterAuthPlugin = {
  id: 'rbac',
  init: () => {},
  schema: {
    user: {
      fields: {
        roles: { type: 'json', input: false },
        permissions: { type: 'json', input: false },
        status: { type: 'string', defaultValue: 'active' },
        locale: { type: 'string', defaultValue: 'en' },
        theme: { type: 'string', defaultValue: 'system' },
      },
    },
  },
  endpoints: {
    checkPermission: createAuthEndpoint(
      '/check-permission',
      {
        method: 'POST',
        body: z.object({ permission: z.string() }),
      },
      async (req) => {
        const session = await getSessionFromCtx(req);
        if (!session) {
          throw new Error('Unauthorized');
        }
        const permissions: string[] = ((session.user as Record<string, unknown>).permissions as string[]) || [];
        return {
          hasPermission: permissions.includes(req.body.permission),
          userPermissions: permissions,
        };
      },
    ),
    setPreferences: createAuthEndpoint(
      '/set-preferences',
      {
        method: 'POST',
        body: z.object({ locale: z.string().optional(), theme: z.string().optional() }),
      },
      async (req) => {
        const session = await getSessionFromCtx(req);
        if (!session) {
          throw new Error('Unauthorized');
        }
        const updates: UserUpdateFields = {};
        if (req.body.locale !== undefined) {
          updates.locale = req.body.locale;
        }
        if (req.body.theme !== undefined) {
          updates.theme = req.body.theme;
        }
        if (Object.keys(updates).length === 0) {
          return session.user;
        }
        await req.context.internalAdapter.updateUser(session.user.id, updates as UserUpdateFields);
        return { ...session.user, ...updates };
      },
    ),
    refreshPermissions: createAuthEndpoint('/refresh-permissions', { method: 'POST' }, async (req) => {
      const session = await getSessionFromCtx(req);
      if (!session) {
        throw new Error('Unauthorized');
      }
      // Roles and permissions are stored as JSON columns on Better Auth's
      // quoted `user` table by the idempotent schema migrator.
      // The internal adapter reads them directly from the persisted row.
      const userRecord = await req.context.internalAdapter.findUserById(session.user.id);
      return {
        roles: ((userRecord as Record<string, unknown>)?.roles as string[]) || [],
        permissions: ((userRecord as Record<string, unknown>)?.permissions as string[]) || [],
      };
    }),
  },
};
