import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it, vi } from 'vitest';
import { AuthRoleEntity, AuthUserRoleEntity, DefaultAuthTenantId } from '../entities';
import { AuthUserRoleRepository } from './auth-user-role.repository';

function roleEntity(id: string, key: string): AuthRoleEntity {
  const entity = new AuthRoleEntity({ key });
  entity.id = id;
  return entity;
}

function userRole(roleId: string): AuthUserRoleEntity {
  return new AuthUserRoleEntity({ userId: 'user-id', roleId });
}

describe('AuthUserRoleRepository', () => {
  it('inserts missing assignments and deletes removed ones idempotently', async () => {
    const roles = [roleEntity('r-user', 'user'), roleEntity('r-admin', 'admin')];
    const existing = [userRole('r-user'), userRole('r-stale')];
    const persist = vi.fn();
    const nativeDelete = vi.fn(() => Promise.resolve(1));
    const flush = vi.fn(() => Promise.resolve());
    const find = vi.fn((entity: unknown) => Promise.resolve(entity === AuthRoleEntity ? roles : existing));
    const transactionalEm = { find, persist, nativeDelete, flush };
    const entityManager = {
      transactional: vi.fn((callback: (em: unknown) => unknown) => callback(transactionalEm)),
    } as unknown as EntityManager;
    const repository = new AuthUserRoleRepository(entityManager);

    const result = await repository.assignRoles({
      userId: 'user-id',
      tenantId: DefaultAuthTenantId,
      roleKeys: ['user', 'admin', 'user'],
      grantedByUserId: 'granter',
    });

    expect(result._unsafeUnwrap()).toEqual(['user', 'admin']);
    expect(find).toHaveBeenNthCalledWith(1, AuthRoleEntity, {
      tenantId: DefaultAuthTenantId,
      key: { $in: ['user', 'admin'] },
    });
    expect(persist).toHaveBeenCalledTimes(1);
    const persisted = persist.mock.calls[0]?.[0] as AuthUserRoleEntity;
    expect(persisted).toBeInstanceOf(AuthUserRoleEntity);
    expect(persisted.roleId).toBe('r-admin');
    expect(persisted.grantedByUserId).toBe('granter');
    expect(nativeDelete).toHaveBeenCalledWith(AuthUserRoleEntity, {
      userId: 'user-id',
      tenantId: DefaultAuthTenantId,
      roleId: { $in: ['r-stale'] },
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('skips the query and deletion when nothing changes', async () => {
    const roles = [roleEntity('r-user', 'user')];
    const existing = [userRole('r-user')];
    const persist = vi.fn();
    const nativeDelete = vi.fn();
    const flush = vi.fn(() => Promise.resolve());
    const find = vi.fn((entity: unknown) => Promise.resolve(entity === AuthRoleEntity ? roles : existing));
    const entityManager = {
      transactional: vi.fn((callback: (em: unknown) => unknown) => callback({ find, persist, nativeDelete, flush })),
    } as unknown as EntityManager;
    const repository = new AuthUserRoleRepository(entityManager);

    const result = await repository.assignRoles({
      userId: 'user-id',
      roleKeys: ['user'],
    });

    expect(result._unsafeUnwrap()).toEqual(['user']);
    expect(persist).not.toHaveBeenCalled();
    expect(nativeDelete).not.toHaveBeenCalled();
  });

  it('does not look up roles when no keys are requested', async () => {
    const find = vi.fn(() => Promise.resolve([]));
    const nativeDelete = vi.fn(() => Promise.resolve(1));
    const flush = vi.fn(() => Promise.resolve());
    const entityManager = {
      transactional: vi.fn((callback: (em: unknown) => unknown) =>
        callback({ find, persist: vi.fn(), nativeDelete, flush }),
      ),
    } as unknown as EntityManager;
    const repository = new AuthUserRoleRepository(entityManager);

    const result = await repository.assignRoles({
      userId: 'user-id',
      roleKeys: [],
    });

    expect(result._unsafeUnwrap()).toEqual([]);
    // Only the existing-assignments lookup runs; the role lookup is skipped.
    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith(AuthUserRoleEntity, {
      userId: 'user-id',
      tenantId: DefaultAuthTenantId,
    });
  });

  it('lists distinct role keys through the auth_user_roles join', async () => {
    const execute = vi.fn(() =>
      Promise.resolve([{ role_key: 'user' }, { role_key: 'admin' }, { role_key: 'user' }, { role_key: null }]),
    );
    const entityManager = {
      getConnection: () => ({ execute }),
    } as unknown as EntityManager;
    const repository = new AuthUserRoleRepository(entityManager);

    const result = await repository.listRoleKeys('user-id');

    expect(result._unsafeUnwrap()).toEqual(['user', 'admin']);
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('auth_user_roles'),
      ['user-id', DefaultAuthTenantId],
      'all',
    );
  });

  it('resolves distinct effective roles and permissions from the join', async () => {
    const execute = vi.fn(() =>
      Promise.resolve([
        { role_key: 'user', permission_key: 'profile:read' },
        { role_key: 'admin', permission_key: 'admin:manage:all' },
        { role_key: 'admin', permission_key: null },
        { role_key: 'user', permission_key: 'profile:read' },
      ]),
    );
    const entityManager = {
      getConnection: () => ({ execute }),
    } as unknown as EntityManager;
    const repository = new AuthUserRoleRepository(entityManager);

    const result = await repository.resolveEffectiveAccess('user-id', 'tenant-id');

    expect(result._unsafeUnwrap()).toEqual({
      roleKeys: ['user', 'admin'],
      permissionKeys: ['profile:read', 'admin:manage:all'],
    });
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('auth_role_permissions'),
      ['user-id', 'tenant-id'],
      'all',
    );
  });

  it('maps repository errors from the join query', async () => {
    const execute = vi.fn(() => Promise.reject(new Error('join failed')));
    const entityManager = {
      getConnection: () => ({ execute }),
    } as unknown as EntityManager;
    const repository = new AuthUserRoleRepository(entityManager);

    const result = await repository.resolveEffectiveAccess('user-id');

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'join failed',
    });
  });

  it('maps transactional failures during assignment', async () => {
    const entityManager = {
      transactional: vi.fn().mockRejectedValue('boom'),
    } as unknown as EntityManager;
    const repository = new AuthUserRoleRepository(entityManager);

    const result = await repository.assignRoles({
      userId: 'user-id',
      roleKeys: ['user'],
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'Auth role repository failed.',
    });
  });

  it('defaults grantedByUserId to null when inserting without a granter', async () => {
    const roles = [roleEntity('r-user', 'user')];
    const persist = vi.fn();
    const nativeDelete = vi.fn(() => Promise.resolve(0));
    const flush = vi.fn(() => Promise.resolve());
    const find = vi.fn((entity: unknown) => Promise.resolve(entity === AuthRoleEntity ? roles : []));
    const entityManager = {
      transactional: vi.fn((callback: (em: unknown) => unknown) => callback({ find, persist, nativeDelete, flush })),
    } as unknown as EntityManager;
    const repository = new AuthUserRoleRepository(entityManager);

    const result = await repository.assignRoles({
      userId: 'user-id',
      roleKeys: ['user'],
    });

    expect(result._unsafeUnwrap()).toEqual(['user']);
    const persisted = persist.mock.calls[0]?.[0] as AuthUserRoleEntity;
    expect(persisted.grantedByUserId).toBeNull();
    expect(nativeDelete).not.toHaveBeenCalled();
  });
});
