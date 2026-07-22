import { describe, expect, it } from 'vitest';
import { AuthenticatedTheme, DefaultAuthTenantId } from '@app/backend-feature-auth-shared';
import { createAuthSession, toSessionPrincipal } from './auth-session.factory';

const baseUser = {
  id: 'user-id',
  tenantId: DefaultAuthTenantId,
  email: null,
  displayName: null,
  avatarUrl: 'https://cdn.example.test/avatar.png',
  passwordHash: 'hash',
  roles: ['user'],
  permissions: ['profile:read'],
  locale: 'uz' as never,
  theme: AuthenticatedTheme.System,
  status: 'active' as const,
  lastLoginAt: null,
};

describe('auth session factory', () => {
  it('omits optional auth claims and normalizes nullable principal fields', () => {
    const session = createAuthSession(baseUser, {});
    const principal = toSessionPrincipal(session);

    expect(session).not.toHaveProperty('amr');
    expect(session).not.toHaveProperty('authProvider');
    expect(session).not.toHaveProperty('authChannel');
    expect(session).not.toHaveProperty('authTime');
    expect(session).not.toHaveProperty('externalIdentityId');
    expect(session).not.toHaveProperty('refreshToken');
    expect(session).not.toHaveProperty('accessToken');
    expect(session).not.toHaveProperty('tokenType');
    expect(principal.email).toBeUndefined();
    expect(principal.avatarUrl).toBe('https://cdn.example.test/avatar.png');
    expect(principal.locale).toBeUndefined();
  });
});
