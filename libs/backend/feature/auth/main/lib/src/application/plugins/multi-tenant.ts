import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { DefaultAuthTenantId } from '@app/backend-feature-auth-shared';

export const multiTenantPlugin: BetterAuthPlugin = {
  id: 'multi-tenant',
  init: () => {},
  schema: {
    user: {
      fields: {
        tenantId: {
          type: 'string',
          defaultValue: DefaultAuthTenantId,
          input: false,
        },
      },
    },
  },
  hooks: {
    after: [
      {
        matcher: (ctx) => {
          const p = ctx.path || '';
          return p.startsWith('/sign-up') || p.startsWith('/sign-in');
        },
        handler: createAuthMiddleware(async (ctx) => ctx),
      },
    ],
  },
};
