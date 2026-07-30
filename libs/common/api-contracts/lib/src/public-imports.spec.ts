// @requirements REQ-API-COMPAT-002
import { describe, expect, it } from 'vitest';
import type { AdminApiSchemas, AuthApiContract, AuthApiSchemas, UserApiSchemas } from './index';

describe('public api-contracts import surface', () => {
  it('exposes generated schemas and namespaced contracts from the stable alias', () => {
    const session = {
      authProvider: 'password',
      user: {
        email: 'ada@example.com',
        id: 'user-1',
        permissions: [],
        roles: ['user'],
        tenantId: 'tenant-1',
        theme: 'system',
      },
    } satisfies Partial<AuthApiSchemas['AuthSessionViewDto']>;
    const profile = {} satisfies Partial<UserApiSchemas['ProfilePayloadDto']>;
    const admin = {} satisfies Partial<AdminApiSchemas['AdminProfilePayloadDto']>;

    expect(session.authProvider).toBe('password');
    expect(profile).toEqual({});
    expect(admin).toEqual({});
  });

  it('keeps the generated namespace available without deep imports', () => {
    type Paths = AuthApiContract.paths;
    const publicAuthPaths = new Set<keyof Paths>(['/auth/me']);

    expect(publicAuthPaths.has('/auth/me')).toBe(true);
  });
});
