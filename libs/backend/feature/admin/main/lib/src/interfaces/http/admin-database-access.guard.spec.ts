// @requirements REQ-AUTH-TENANT-004
import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { canAdmin, type AdminAuthorizedRequest } from '@app/backend-feature-admin-shared';
import {
  PublicAuthMetadataKey,
  resolveDemoPrincipal,
  type AuthenticatedRequest,
  type AuthUserRepositoryPort,
  type AuthUserRoleRepositoryPort,
} from '@app/backend-feature-auth-shared';
import { AdminDatabaseAccessGuard } from './admin-database-access.guard';

const tenantId = '00000000-0000-4000-8000-000000000001';

function contextFor(request: AuthenticatedRequest, health = false) {
  const handler = () => undefined;
  const controller = class AdminController {};
  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
    health,
  } as never;
}

function dependencies(input?: {
  access?: { roleKeys: string[]; permissionKeys: string[] };
  user?: { status: 'active' | 'disabled' } | null;
  userError?: boolean;
  accessError?: boolean;
  health?: boolean;
  metadataMissing?: boolean;
  public?: boolean;
}) {
  const metadata = {
    getAllAndOverride: vi.fn((key: string) => {
      if (input?.metadataMissing) {
        return undefined;
      }
      return key === PublicAuthMetadataKey ? (input?.public ?? false) : (input?.health ?? false);
    }),
  } as unknown as Reflector;
  const users = {
    findById: vi.fn(async () =>
      input?.userError
        ? ({ isErr: () => true } as never)
        : ({
            isErr: () => false,
            value: input?.user === undefined ? { status: 'active' } : input.user,
          } as never),
    ),
  } as unknown as AuthUserRepositoryPort;
  const roles = {
    resolveEffectiveAccess: vi.fn(async () =>
      input?.accessError
        ? ({ isErr: () => true } as never)
        : ({
            isErr: () => false,
            value: input?.access ?? { roleKeys: ['support'], permissionKeys: ['admin:users:read'] },
          } as never),
    ),
  } as unknown as AuthUserRoleRepositoryPort;
  return { metadata, users, roles, guard: new AdminDatabaseAccessGuard(metadata, users, roles) };
}

describe('AdminDatabaseAccessGuard', () => {
  it('replaces token/session access claims with normalized database access', async () => {
    const request: AdminAuthorizedRequest = {
      user: {
        subject: 'user-id',
        tenantId,
        roles: ['admin'],
        permissions: ['admin:manage:all'],
      },
    };
    const { guard, roles, users } = dependencies();

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(users.findById).toHaveBeenCalledWith('user-id', tenantId);
    expect(roles.resolveEffectiveAccess).toHaveBeenCalledWith('user-id', tenantId);
    expect(request.user).toMatchObject({ roles: ['support'], permissions: ['admin:users:read'] });
    expect(request.auth).toBe(request.user);
    expect(canAdmin(request.adminAbility, 'read', 'admin.users')).toBe(true);
  });

  it('denies missing, inactive, and deleted identities before authorization runs', async () => {
    await expect(dependencies().guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(UnauthorizedException);
    const inactive = dependencies({ user: { status: 'disabled' } });
    await expect(
      inactive.guard.canActivate(contextFor({ user: { subject: 'user-id', tenantId, roles: [], permissions: [] } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const missing = dependencies({ user: null });
    await expect(
      missing.guard.canActivate(contextFor({ user: { subject: 'user-id', tenantId, roles: [], permissions: [] } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('fails closed when the database cannot resolve identity or access', async () => {
    const request: AuthenticatedRequest = { user: { subject: 'user-id', tenantId, roles: [], permissions: [] } };
    await expect(dependencies({ userError: true }).guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    await expect(dependencies({ accessError: true }).guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('leaves health and public endpoints outside the database access path', async () => {
    const { guard, users, roles } = dependencies({ health: true });

    await expect(guard.canActivate(contextFor({}, true))).resolves.toBe(true);

    expect(users.findById).not.toHaveBeenCalled();
    expect(roles.resolveEffectiveAccess).not.toHaveBeenCalled();

    const publicRoute = dependencies({ public: true });
    await expect(publicRoute.guard.canActivate(contextFor({}))).resolves.toBe(true);
    expect(publicRoute.users.findById).not.toHaveBeenCalled();
    expect(publicRoute.roles.resolveEffectiveAccess).not.toHaveBeenCalled();
  });

  it('grants the demo principal its configured admin access without a database account', async () => {
    const demo = resolveDemoPrincipal({ AUTH_DEMO_MODE: 'true', AUTH_DEMO_ROLES: 'admin' });
    const request: AdminAuthorizedRequest = { user: demo };
    const { guard, roles, users } = dependencies();

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(users.findById).not.toHaveBeenCalled();
    expect(roles.resolveEffectiveAccess).not.toHaveBeenCalled();
    expect(request.user).toBe(demo);
    expect(canAdmin(request.adminAbility, 'read', 'admin.users')).toBe(true);
  });

  it('still refuses a look-alike principal that only claims to be the demo user', async () => {
    const forged = JSON.parse(
      JSON.stringify(resolveDemoPrincipal({ AUTH_DEMO_MODE: 'true', AUTH_DEMO_ROLES: 'admin' })),
    );
    const { guard, users } = dependencies({ user: null });

    await expect(guard.canActivate(contextFor({ user: forged }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.findById).toHaveBeenCalled();
  });

  it('requires authentication when exclusion metadata is absent', async () => {
    const { guard, roles, users } = dependencies({ metadataMissing: true });

    await expect(guard.canActivate(contextFor({}))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.findById).not.toHaveBeenCalled();
    expect(roles.resolveEffectiveAccess).not.toHaveBeenCalled();
  });
});
