import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
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

  it('assigns roles and refreshes the jsonb cache to the shared-matrix arrays', async () => {
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

    const persisted = (await users.findById(created.id))._unsafeUnwrap();
    expect(persisted?.roles).toEqual(adminPolicy.roles);
    expect(persisted?.permissions).toEqual(adminPolicy.permissions);
  });

  it('never wipes the cache when the normalized tables resolve no roles', async () => {
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
    const setAccessPolicy = vi.spyOn(users, 'setAccessPolicy');

    const refreshed = await service.refresh(created.id, created.tenantId);

    // No roles were assigned, so the resolver leaves the create-time arrays.
    expect(setAccessPolicy).not.toHaveBeenCalled();
    expect(refreshed?.roles).toEqual([UserRole]);
    expect(refreshed?.permissions).toEqual([UserProfileReadPermission]);
  });

  it('returns null when refreshing an unknown user with no resolved roles', async () => {
    const users = new InMemoryAuthUserStore();
    const roles = new InMemoryAuthRoleStore();
    const service = new EffectivePermissionService(roles, users);

    await expect(service.refresh('missing', DefaultAuthTenantId)).resolves.toBe(null);
  });

  it('returns null when the current user lookup fails after resolving no roles', async () => {
    const roles = {
      resolveEffectiveAccess: () => okAsync({ roleKeys: [], permissionKeys: [] }),
    } as unknown as AuthRoleStore;
    const users = {
      findById: () => errAsync(repositoryError),
    } as unknown as AuthUserStore;

    await expect(
      new EffectivePermissionService(roles, users).refresh('missing', DefaultAuthTenantId),
    ).resolves.toBeNull();
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

    const resolvingRoles = {
      resolveEffectiveAccess: () =>
        okAsync({
          roleKeys: [UserRole],
          permissionKeys: [UserProfileReadPermission],
        }),
    } as unknown as AuthRoleStore;
    const failingUsers = {
      setAccessPolicy: () => errAsync(repositoryError),
    } as unknown as AuthUserStore;
    await expect(
      new EffectivePermissionService(resolvingRoles, failingUsers).refresh('user-id', DefaultAuthTenantId),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
