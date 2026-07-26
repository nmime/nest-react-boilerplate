// @requirements REQ-AUTH-PROFILE-006
import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { PublicAuthMetadataKey, type AuthenticatedRequest } from '@app/backend-feature-auth-shared';
import type { AuthUserRepository, AuthUserRoleRepository } from '@app/backend-postgres-main-auth';
import { UserDatabaseSessionAccessGuard } from './user-database-session-access.guard';

const tenantId = '00000000-0000-4000-8000-000000000001';
const principal = { subject: 'user-id', tenantId, roles: ['stale'], permissions: ['stale:permission'] };

function contextFor(request: AuthenticatedRequest) {
  return {
    getClass: () => class UserController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

function dependencies(input?: {
  user?: { status: string } | null;
  userError?: boolean;
  accessError?: boolean;
  public?: boolean;
}) {
  const metadata = {
    getAllAndOverride: vi.fn((key: string) => (key === PublicAuthMetadataKey ? (input?.public ?? false) : false)),
  } as unknown as Reflector;
  const users = {
    findById: vi.fn(async () =>
      input?.userError
        ? ({ isErr: () => true } as never)
        : ({ isErr: () => false, value: input?.user === undefined ? { status: 'active' } : input.user } as never),
    ),
  } as unknown as AuthUserRepository;
  const roles = {
    resolveEffectiveAccess: vi.fn(async () =>
      input?.accessError
        ? ({ isErr: () => true } as never)
        : ({ isErr: () => false, value: { roleKeys: ['member'], permissionKeys: ['profile:read'] } } as never),
    ),
  } as unknown as AuthUserRoleRepository;
  return { guard: new UserDatabaseSessionAccessGuard(metadata, users, roles), roles, users };
}

describe(UserDatabaseSessionAccessGuard.name, () => {
  it('uses session identity and database-authoritative access', async () => {
    const request: AuthenticatedRequest = { session: { user: principal } };
    const { guard, roles, users } = dependencies();
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(users.findById).toHaveBeenCalledWith('user-id', tenantId);
    expect(roles.resolveEffectiveAccess).toHaveBeenCalledWith('user-id', tenantId);
    expect(request.user).toMatchObject({ roles: ['member'], permissions: ['profile:read'] });
  });

  it('rejects bearer-only and disabled identities', async () => {
    await expect(
      dependencies().guard.canActivate(contextFor({ headers: { authorization: 'Bearer ignored' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      dependencies({ user: { status: 'disabled' } }).guard.canActivate(contextFor({ session: { user: principal } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('fails closed when the identity or RBAC lookup fails', async () => {
    await expect(
      dependencies({ userError: true }).guard.canActivate(contextFor({ session: { user: principal } })),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(
      dependencies({ accessError: true }).guard.canActivate(contextFor({ session: { user: principal } })),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('keeps explicitly public routes outside the database path', async () => {
    const { guard, roles, users } = dependencies({ public: true });
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(users.findById).not.toHaveBeenCalled();
    expect(roles.resolveEffectiveAccess).not.toHaveBeenCalled();
  });
});
