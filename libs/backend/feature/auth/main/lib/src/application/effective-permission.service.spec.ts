// @requirements REQ-AUTH-TENANT-004
import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import {
  AdminRole,
  DefaultAuthTenantId,
  UserProfileReadPermission,
  UserRole,
  createDefaultAccessPolicy,
} from '@app/backend-feature-auth-shared';
import { InMemoryAuthRoleStore, type AuthRoleStore } from '../infrastructure/auth-role-store';
import { InMemoryAuthUserStore, type AuthUserStore } from '../infrastructure/auth-user-store';
import { EffectivePermissionService } from './effective-permission.service';

const repositoryError = {
  code: 'repository_error' as const,
  message: 'boom',
};

describe('EffectivePermissionService', () => {
  it('canonicalizes resolved roles and permissions from the RBAC join', async () => {
    const roles = {
      resolveEffectiveAccess: () =>
        okAsync({
          // Deliberately scrambled + a permission key not granted through the
          // seeded matrix to prove the service orders by catalog index.
          roleKeys: [AdminRole, UserRole],
          permissionKeys: ['admin:manage:all', UserProfileReadPermission, 'admin:dashboard:read'],
        }),
    } as unknown as AuthRoleStore;
    const users = {} as unknown as AuthUserStore;
    const service = new EffectivePermissionService(roles, users);

    const access = await service.resolveEffectiveAccess('user-id', DefaultAuthTenantId);

    expect(access.roleKeys).toEqual([UserRole, AdminRole]);
    expect(access.permissionKeys).toEqual([UserProfileReadPermission, 'admin:dashboard:read', 'admin:manage:all']);
  });

  it('assigns roles and returns the shared-matrix projection', async () => {
    const users = new InMemoryAuthUserStore();
    const roles = new InMemoryAuthRoleStore();
    const service = new EffectivePermissionService(roles, users);
    const created = (
      await users.create({
        email: 'member@example.com',
        passwordHash: 'hash',
        roles: [],
        permissions: [],
      })
    )._unsafeUnwrap();

    const refreshed = await service.assignRolesAndRefresh({
      userId: created.id,
      tenantId: created.tenantId,
      roleKeys: [UserRole, AdminRole],
    });

    const adminPolicy = createDefaultAccessPolicy('admin@example.com', {
      ADMIN_BOOTSTRAP_ENABLED: 'true',
      ADMIN_BOOTSTRAP_EMAILS: 'admin@example.com',
    });
    expect(refreshed?.roles).toEqual(adminPolicy.roles);
    expect(refreshed?.permissions).toEqual(adminPolicy.permissions);

    const storedProfile = (await users.findById(created.id))._unsafeUnwrap();
    expect(storedProfile?.roles).toEqual([]);
    expect(storedProfile?.permissions).toEqual([]);
  });

  it('returns an empty projection when normalized tables contain no grants', async () => {
    const users = new InMemoryAuthUserStore();
    const roles = new InMemoryAuthRoleStore();
    const service = new EffectivePermissionService(roles, users);
    const created = (
      await users.create({
        email: 'member@example.com',
        passwordHash: 'hash',
        roles: [UserRole],
        permissions: [UserProfileReadPermission],
      })
    )._unsafeUnwrap();
    const refreshed = await service.refresh(created.id, created.tenantId);

    expect(refreshed?.roles).toEqual([]);
    expect(refreshed?.permissions).toEqual([]);
  });

  it('returns null when refreshing an unknown user with no resolved roles', async () => {
    const users = new InMemoryAuthUserStore();
    const roles = new InMemoryAuthRoleStore();
    const service = new EffectivePermissionService(roles, users);

    await expect(service.refresh('missing', DefaultAuthTenantId)).resolves.toBe(null);
  });

  it('maps user-store lookup failures to ConflictException', async () => {
    const roles = {
      resolveEffectiveAccess: () => okAsync({ roleKeys: [], permissionKeys: [] }),
    } as unknown as AuthRoleStore;
    const users = {
      findById: () => errAsync(repositoryError),
    } as unknown as AuthUserStore;

    await expect(
      new EffectivePermissionService(roles, users).refresh('missing', DefaultAuthTenantId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps store failures to ConflictException', async () => {
    const failingAssign = {
      assignRoles: () => errAsync(repositoryError),
      resolveEffectiveAccess: () => okAsync({ roleKeys: [], permissionKeys: [] }),
    } as unknown as AuthRoleStore;
    const users = {} as unknown as AuthUserStore;
    await expect(
      new EffectivePermissionService(failingAssign, users).assignRolesAndRefresh({
        userId: 'user-id',
        tenantId: DefaultAuthTenantId,
        roleKeys: [UserRole],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const failingResolve = {
      resolveEffectiveAccess: () => errAsync(repositoryError),
    } as unknown as AuthRoleStore;
    await expect(
      new EffectivePermissionService(failingResolve, users).resolveEffectiveAccess('user-id', DefaultAuthTenantId),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
