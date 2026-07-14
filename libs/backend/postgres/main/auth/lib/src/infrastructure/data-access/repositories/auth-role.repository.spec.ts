import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it, vi } from 'vitest';
import { AuthPermissionEntity, AuthRoleEntity, AuthRolePermissionEntity, DefaultAuthTenantId } from '../entities';
import { AuthRoleRepository } from './auth-role.repository';

describe('AuthRoleRepository', () => {
  it('finds a role by tenant and key', async () => {
    const entity = new AuthRoleEntity({ key: 'admin' });
    const findOne = vi.fn(() => Promise.resolve(entity));
    const repository = new AuthRoleRepository({
      findOne,
    } as unknown as EntityManager);

    const result = await repository.findByKey('admin');

    expect(result._unsafeUnwrap()).toBe(entity);
    expect(findOne).toHaveBeenCalledWith(AuthRoleEntity, {
      tenantId: DefaultAuthTenantId,
      key: 'admin',
    });
  });

  it('finds multiple roles by distinct keys', async () => {
    const entities = [new AuthRoleEntity({ key: 'user' }), new AuthRoleEntity({ key: 'admin' })];
    const find = vi.fn(() => Promise.resolve(entities));
    const repository = new AuthRoleRepository({
      find,
    } as unknown as EntityManager);

    const result = await repository.findByKeys(['user', 'admin', 'user'], 'tenant-id');

    expect(result._unsafeUnwrap()).toBe(entities);
    expect(find).toHaveBeenCalledWith(AuthRoleEntity, {
      tenantId: 'tenant-id',
      key: { $in: ['user', 'admin'] },
    });
  });

  it('short-circuits without querying when no keys are supplied', async () => {
    const find = vi.fn(() => Promise.resolve([]));
    const repository = new AuthRoleRepository({
      find,
    } as unknown as EntityManager);

    expect((await repository.findByKeys([]))._unsafeUnwrap()).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('maps repository errors', async () => {
    const findOne = vi.fn(() => Promise.reject(new Error('role lookup failed')));
    const repository = new AuthRoleRepository({
      findOne,
    } as unknown as EntityManager);

    const result = await repository.findByKey('user');

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'role lookup failed',
    });
  });

  it('maps non-error failures to a stable message', async () => {
    const find = vi.fn().mockRejectedValue('db offline');
    const repository = new AuthRoleRepository({
      find,
    } as unknown as EntityManager);

    const result = await repository.findByKeys(['user']);

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'Auth role repository failed.',
    });
  });
});

describe('AuthRoleRepository role management', () => {
  const adminRole = new AuthRoleEntity({ key: 'admin' });
  adminRole.id = 'role-admin';
  const usersRead = new AuthPermissionEntity({
    key: 'admin:users:read',
    resource: 'admin.users',
    action: 'read',
  });
  usersRead.id = 'perm-users-read';
  const rolesWrite = new AuthPermissionEntity({
    key: 'admin:roles:write',
    resource: 'admin.roles',
    action: 'write',
  });
  rolesWrite.id = 'perm-roles-write';

  it('lists roles joined with their permission keys', async () => {
    const find = vi.fn((entity: unknown) => {
      if (entity === AuthRoleEntity) {
        return Promise.resolve([adminRole]);
      }
      if (entity === AuthRolePermissionEntity) {
        return Promise.resolve([
          new AuthRolePermissionEntity({
            roleId: 'role-admin',
            permissionId: 'perm-users-read',
          }),
        ]);
      }
      return Promise.resolve([usersRead]);
    });
    const repository = new AuthRoleRepository({
      find,
    } as unknown as EntityManager);

    const result = await repository.listRolesWithPermissions();

    expect(result._unsafeUnwrap()).toEqual([{ role: adminRole, permissionKeys: ['admin:users:read'] }]);
  });

  it('persists a new role and flushes', async () => {
    const persist = vi.fn();
    const flush = vi.fn(() => Promise.resolve());
    const repository = new AuthRoleRepository({
      persist,
      flush,
    } as unknown as EntityManager);

    const result = await repository.createRole({
      key: 'support',
      label: 'Support',
    });

    const role = result._unsafeUnwrap();
    expect(role.key).toBe('support');
    expect(role.label).toBe('Support');
    expect(persist).toHaveBeenCalledWith(role);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('updates only the provided role fields', async () => {
    const findOne = vi.fn(() => Promise.resolve(new AuthRoleEntity({ key: 'admin' })));
    const flush = vi.fn(() => Promise.resolve());
    const repository = new AuthRoleRepository({
      findOne,
      flush,
    } as unknown as EntityManager);

    const result = await repository.updateRole('role-admin', {
      description: 'Back office',
    });

    expect(result._unsafeUnwrap()?.description).toBe('Back office');
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('returns null when updating a role that does not exist', async () => {
    const findOne = vi.fn(() => Promise.resolve(null));
    const repository = new AuthRoleRepository({
      findOne,
    } as unknown as EntityManager);

    expect((await repository.updateRole('missing', { label: 'x' }))._unsafeUnwrap()).toBeNull();
  });

  it("reconciles a role's permission grants inside a transaction", async () => {
    const persist = vi.fn();
    const nativeDelete = vi.fn(() => Promise.resolve(1));
    const flush = vi.fn(() => Promise.resolve());
    const txEm = {
      findOne: vi.fn(() => Promise.resolve(adminRole)),
      find: vi.fn((entity: unknown) => {
        if (entity === AuthPermissionEntity) {
          return Promise.resolve([rolesWrite]);
        }
        // Existing grants: users:read (to be removed since only roles:write desired).
        return Promise.resolve([
          new AuthRolePermissionEntity({
            roleId: 'role-admin',
            permissionId: 'perm-users-read',
          }),
        ]);
      }),
      persist,
      nativeDelete,
      flush,
    };
    const transactional = vi.fn((callback: (em: unknown) => unknown) => callback(txEm));
    const repository = new AuthRoleRepository({
      transactional,
    } as unknown as EntityManager);

    const result = await repository.setRolePermissions('role-admin', ['admin:roles:write']);

    expect(result._unsafeUnwrap()).toEqual({
      role: adminRole,
      permissionKeys: ['admin:roles:write'],
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(nativeDelete).toHaveBeenCalledWith(AuthRolePermissionEntity, {
      roleId: 'role-admin',
      permissionId: { $in: ['perm-users-read'] },
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('returns null when setting permissions for a missing role', async () => {
    const txEm = { findOne: vi.fn(() => Promise.resolve(null)) };
    const transactional = vi.fn((callback: (em: unknown) => unknown) => callback(txEm));
    const repository = new AuthRoleRepository({
      transactional,
    } as unknown as EntityManager);

    expect((await repository.setRolePermissions('missing', ['admin:roles:write']))._unsafeUnwrap()).toBeNull();
  });
});

describe('AuthRoleRepository lookups and reconciliation edge cases', () => {
  it('finds a role by id within a tenant', async () => {
    const entity = new AuthRoleEntity({ key: 'admin' });
    entity.id = 'role-admin';
    const findOne = vi.fn(() => Promise.resolve(entity));
    const repository = new AuthRoleRepository({
      findOne,
    } as unknown as EntityManager);

    const result = await repository.findById('role-admin', 'tenant-id');

    expect(result._unsafeUnwrap()).toBe(entity);
    expect(findOne).toHaveBeenCalledWith(AuthRoleEntity, {
      id: 'role-admin',
      tenantId: 'tenant-id',
    });
  });

  it('lists the seeded permission catalog from the database', async () => {
    const permissions = [
      new AuthPermissionEntity({
        key: 'profile:read',
        resource: 'profile',
        action: 'read',
      }),
    ];
    const find = vi.fn(() => Promise.resolve(permissions));
    const repository = new AuthRoleRepository({
      find,
    } as unknown as EntityManager);

    const result = await repository.listPermissions();

    expect(result._unsafeUnwrap()).toBe(permissions);
    expect(find).toHaveBeenCalledWith(AuthPermissionEntity, {});
  });

  it('persists a new role honouring explicit tenant and system flag', async () => {
    const persist = vi.fn();
    const flush = vi.fn(() => Promise.resolve());
    const repository = new AuthRoleRepository({
      persist,
      flush,
    } as unknown as EntityManager);

    const result = await repository.createRole({
      tenantId: 'tenant-x',
      key: 'ops',
      label: 'Ops',
      description: 'Operations',
      isSystem: true,
    });

    const role = result._unsafeUnwrap();
    expect(role).toMatchObject({
      tenantId: 'tenant-x',
      key: 'ops',
      isSystem: true,
    });
  });

  it('returns an empty list when the tenant has no roles', async () => {
    const find = vi.fn(() => Promise.resolve([]));
    const repository = new AuthRoleRepository({
      find,
    } as unknown as EntityManager);

    expect((await repository.listRolesWithPermissions())._unsafeUnwrap()).toEqual([]);
  });

  it('skips unmapped permissions and returns empty keys for permissionless roles', async () => {
    const roleA = new AuthRoleEntity({ key: 'admin' });
    roleA.id = 'role-a';
    const roleB = new AuthRoleEntity({ key: 'support' });
    roleB.id = 'role-b';
    const k1 = new AuthPermissionEntity({
      key: 'k1',
      resource: 'r',
      action: 'a',
    });
    k1.id = 'p1';
    const k2 = new AuthPermissionEntity({
      key: 'k2',
      resource: 'r',
      action: 'b',
    });
    k2.id = 'p2';
    const find = vi.fn((entity: unknown) => {
      if (entity === AuthRoleEntity) {
        return Promise.resolve([roleA, roleB]);
      }
      if (entity === AuthRolePermissionEntity) {
        return Promise.resolve([
          new AuthRolePermissionEntity({
            roleId: 'role-a',
            permissionId: 'p1',
          }),
          new AuthRolePermissionEntity({
            roleId: 'role-a',
            permissionId: 'p2',
          }),
          new AuthRolePermissionEntity({
            roleId: 'role-a',
            permissionId: 'p-missing',
          }),
        ]);
      }
      return Promise.resolve([k1, k2]);
    });
    const repository = new AuthRoleRepository({
      find,
    } as unknown as EntityManager);

    const result = await repository.listRolesWithPermissions();

    expect(result._unsafeUnwrap()).toEqual([
      { role: roleA, permissionKeys: ['k1', 'k2'] },
      { role: roleB, permissionKeys: [] },
    ]);
  });

  it('returns roles with empty permission keys when no grants exist', async () => {
    const roleA = new AuthRoleEntity({ key: 'admin' });
    roleA.id = 'role-a';
    const find = vi.fn((entity: unknown) => {
      if (entity === AuthRoleEntity) {
        return Promise.resolve([roleA]);
      }
      return Promise.resolve([]);
    });
    const repository = new AuthRoleRepository({
      find,
    } as unknown as EntityManager);

    const result = await repository.listRolesWithPermissions();

    expect(result._unsafeUnwrap()).toEqual([{ role: roleA, permissionKeys: [] }]);
  });

  it('updates only the role label when provided', async () => {
    const role = new AuthRoleEntity({ key: 'admin' });
    const findOne = vi.fn(() => Promise.resolve(role));
    const flush = vi.fn(() => Promise.resolve());
    const repository = new AuthRoleRepository({
      findOne,
      flush,
    } as unknown as EntityManager);

    const result = await repository.updateRole('role-admin', {
      label: 'Administrators',
    });

    expect(result._unsafeUnwrap()?.label).toBe('Administrators');
  });

  it('clears all grants when reconciling to an empty permission set', async () => {
    const role = new AuthRoleEntity({ key: 'admin' });
    role.id = 'role-admin';
    const persist = vi.fn();
    const nativeDelete = vi.fn(() => Promise.resolve(0));
    const flush = vi.fn(() => Promise.resolve());
    const txEm = {
      findOne: vi.fn(() => Promise.resolve(role)),
      find: vi.fn(() => Promise.resolve([])),
      persist,
      nativeDelete,
      flush,
    };
    const transactional = vi.fn((callback: (em: unknown) => unknown) => callback(txEm));
    const repository = new AuthRoleRepository({
      transactional,
    } as unknown as EntityManager);

    const result = await repository.setRolePermissions('role-admin', []);

    expect(result._unsafeUnwrap()).toEqual({ role, permissionKeys: [] });
    expect(persist).not.toHaveBeenCalled();
    expect(nativeDelete).not.toHaveBeenCalled();
  });

  it('leaves already-granted permissions untouched without deleting', async () => {
    const role = new AuthRoleEntity({ key: 'admin' });
    role.id = 'role-admin';
    const permission = new AuthPermissionEntity({
      key: 'admin:roles:write',
      resource: 'admin.roles',
      action: 'write',
    });
    permission.id = 'perm-roles-write';
    const persist = vi.fn();
    const nativeDelete = vi.fn(() => Promise.resolve(0));
    const flush = vi.fn(() => Promise.resolve());
    const txEm = {
      findOne: vi.fn(() => Promise.resolve(role)),
      find: vi.fn((entity: unknown) => {
        if (entity === AuthPermissionEntity) {
          return Promise.resolve([permission]);
        }
        return Promise.resolve([
          new AuthRolePermissionEntity({
            roleId: 'role-admin',
            permissionId: 'perm-roles-write',
          }),
        ]);
      }),
      persist,
      nativeDelete,
      flush,
    };
    const transactional = vi.fn((callback: (em: unknown) => unknown) => callback(txEm));
    const repository = new AuthRoleRepository({
      transactional,
    } as unknown as EntityManager);

    const result = await repository.setRolePermissions('role-admin', ['admin:roles:write']);

    expect(result._unsafeUnwrap()).toEqual({
      role,
      permissionKeys: ['admin:roles:write'],
    });
    expect(persist).not.toHaveBeenCalled();
    expect(nativeDelete).not.toHaveBeenCalled();
  });
});
