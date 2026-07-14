import { describe, expect, it, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import {
  AdminRole,
  DefaultAuthTenantId,
  UserProfileReadPermission,
  UserRole,
  permissionsForRoles,
} from '@app/backend-feature-auth-shared';
import { InMemoryAuthRoleStore, PostgresAuthRoleStore } from './auth-role-store';

function sorted(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

describe('auth role stores', () => {
  it('simulates role -> permission resolution in memory using the shared matrix', async () => {
    const store = new InMemoryAuthRoleStore();

    const assigned = (
      await store.assignRoles({
        userId: 'user-id',
        tenantId: DefaultAuthTenantId,
        roleKeys: [UserRole, AdminRole, UserRole],
      })
    )._unsafeUnwrap();
    expect(sorted(assigned)).toEqual([AdminRole, UserRole]);

    expect(sorted((await store.listRoleKeys('user-id'))._unsafeUnwrap())).toEqual([AdminRole, UserRole]);

    const access = (await store.resolveEffectiveAccess('user-id'))._unsafeUnwrap();
    expect(sorted(access.roleKeys)).toEqual([AdminRole, UserRole]);
    expect(access.permissionKeys).toEqual(permissionsForRoles([UserRole, AdminRole]));
  });

  it('reassigns idempotently, dropping roles that are no longer requested', async () => {
    const store = new InMemoryAuthRoleStore();
    await store.assignRoles({
      userId: 'user-id',
      tenantId: DefaultAuthTenantId,
      roleKeys: [UserRole, AdminRole],
    });

    await store.assignRoles({
      userId: 'user-id',
      tenantId: DefaultAuthTenantId,
      roleKeys: [UserRole],
    });

    const access = (await store.resolveEffectiveAccess('user-id'))._unsafeUnwrap();
    expect(access.roleKeys).toEqual([UserRole]);
    expect(access.permissionKeys).toEqual([UserProfileReadPermission]);
  });

  it('returns empty access for users without assignments and other tenants', async () => {
    const store = new InMemoryAuthRoleStore();
    await store.assignRoles({
      userId: 'user-id',
      tenantId: DefaultAuthTenantId,
      roleKeys: [UserRole],
    });

    expect((await store.listRoleKeys('missing'))._unsafeUnwrap()).toEqual([]);
    expect((await store.resolveEffectiveAccess('user-id', 'other-tenant'))._unsafeUnwrap()).toEqual({
      roleKeys: [],
      permissionKeys: [],
    });
  });

  it('delegates every call to the auth user role repository in Postgres mode', async () => {
    const repository = {
      assignRoles: vi.fn(() => okAsync([UserRole])),
      listRoleKeys: vi.fn(() => okAsync([UserRole])),
      resolveEffectiveAccess: vi.fn(() =>
        okAsync({
          roleKeys: [UserRole],
          permissionKeys: [UserProfileReadPermission],
        }),
      ),
    };
    const store = new PostgresAuthRoleStore(repository as never);

    expect(
      (
        await store.assignRoles({
          userId: 'user-id',
          tenantId: DefaultAuthTenantId,
          roleKeys: [UserRole],
          grantedByUserId: 'granter',
        })
      )._unsafeUnwrap(),
    ).toEqual([UserRole]);
    expect(repository.assignRoles).toHaveBeenCalledWith({
      userId: 'user-id',
      tenantId: DefaultAuthTenantId,
      roleKeys: [UserRole],
      grantedByUserId: 'granter',
    });

    expect((await store.listRoleKeys('user-id'))._unsafeUnwrap()).toEqual([UserRole]);
    expect(repository.listRoleKeys).toHaveBeenCalledWith('user-id', DefaultAuthTenantId);

    expect((await store.resolveEffectiveAccess('user-id'))._unsafeUnwrap()).toEqual({
      roleKeys: [UserRole],
      permissionKeys: [UserProfileReadPermission],
    });
    expect(repository.resolveEffectiveAccess).toHaveBeenCalledWith('user-id', DefaultAuthTenantId);
  });
});
