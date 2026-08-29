// @requirements REQ-AUTH-TENANT-004
// Evidence for: REQ-AUTH-ACCESS-001 REQ-AUTH-SESSION-002 REQ-AUTH-TENANT-004
import { UnauthorizedException } from '@nestjs/common';
// Security evidence for REQ-AUTH-ACCESS-001 and REQ-AUTH-SESSION-002.
import { describe, expect, it } from 'vitest';
import { DefaultAuthTenantId } from '@app/backend-feature-auth-shared';
import { hashPassword } from '../domain';
import { InMemoryAuthUserStore } from '../infrastructure/auth-user-store';
import { AuthService } from './auth.service';
import { toSessionPrincipal } from './auth-session.factory';

const tenantAId = '11111111-1111-4111-8111-111111111111';
const tenantBId = '22222222-2222-4222-8222-222222222222';

describe('AuthService tenant isolation', () => {
  it('always self-registers public users in the default tenant and ignores the deprecated tenant field', async () => {
    const service = new AuthService(new InMemoryAuthUserStore());

    await expect(
      service.register({
        tenantId: tenantAId,
        email: 'new@example.com',
        password: 'password123',
      } as Parameters<AuthService['register']>[0] & { tenantId: string }),
    ).resolves.toMatchObject({
      user: { tenantId: DefaultAuthTenantId },
    });
  });

  it('scopes login, lookups, preferences, and session principals by tenant', async () => {
    const users = new InMemoryAuthUserStore();
    const service = new AuthService(users);
    const createUser = (tenantId: string) =>
      users.create({
        tenantId,
        email: 'ada@example.com',
        displayName: 'Ada',
        passwordHash: hashPassword('password123'),
        roles: ['user'],
        permissions: ['profile:read'],
      });
    const tenantAUser = (await createUser(tenantAId))._unsafeUnwrap();
    const tenantBUser = (await createUser(tenantBId))._unsafeUnwrap();
    const tenantASession = service.createUserSession(tenantAUser);
    const tenantBSession = service.createUserSession(tenantBUser);

    expect(tenantASession.user.tenantId).toBe(tenantAId);
    expect(tenantBSession.user.tenantId).toBe(tenantBId);
    expect(tenantASession.user.id).not.toBe(tenantBSession.user.id);

    await expect(
      service.login({
        email: 'ada@example.com',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(service.getUserById(tenantASession.user.id, tenantBId)).resolves.toBeNull();

    const updated = await service.updateUserPreferences(tenantASession.user.id, tenantAId, { theme: 'dark' });
    expect(updated.tenantId).toBe(tenantAId);
    expect(updated.theme).toBe('dark');
    await expect(
      service.updateUserPreferences(tenantASession.user.id, tenantBId, {
        theme: 'light',
      }),
    ).rejects.toThrow('User was not found in tenant.');

    const principal = toSessionPrincipal(tenantASession);
    expect(principal).toMatchObject({
      subject: tenantASession.user.id,
      tenantId: tenantAId,
      email: 'ada@example.com',
    });
  });
});
