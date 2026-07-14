import { LockMode, type EntityManager } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import {
  AdminAuditLogEntity,
  AuthPermissionEntity,
  AuthRoleEntity,
  AuthRolePermissionEntity,
  AuthUserEntity,
  AuthUserRoleEntity,
  TransactionalOutboxEventEntity,
} from '../entities';
import {
  AdminRoleName,
  AdminUsersAccessPolicyUpdatePermissionName,
  AdminUsersWritePermissionName,
  AdminUserMutationRepository,
  hasActivePowerfulAdminAccess,
} from './admin-user-mutation.repository';

const tenantId = '00000000-0000-4000-8000-000000000001';
const targetUserId = '00000000-0000-4000-8000-000000000002';
const actorUserId = '00000000-0000-4000-8000-000000000003';

function createPowerfulAdmin(partial: Partial<AuthUserEntity> = {}) {
  const entity = new AuthUserEntity({
    tenantId,
    email: 'admin@example.com',
    status: 'active',
    roles: [AdminRoleName],
    permissions: [AdminUsersWritePermissionName, AdminUsersAccessPolicyUpdatePermissionName],
  });
  entity.id = targetUserId;
  Object.assign(entity, partial);

  return entity;
}

function createEntityManagerMock(
  input: {
    user?: AuthUserEntity | null;
    powerfulAdminCount?: number;
    flush?: () => Promise<void>;
  } = {},
) {
  const user = input.user === undefined ? createPowerfulAdmin() : input.user;
  const execute = vi.fn(() => Promise.resolve());
  const findOne = vi.fn(() => Promise.resolve(user));
  const count = vi.fn(() => Promise.resolve(input.powerfulAdminCount ?? 2));
  const persist = vi.fn(() => undefined);
  const flush = vi.fn(input.flush ?? (() => Promise.resolve()));
  const transactionalEntityManager = {
    getConnection: () => ({ execute }),
    findOne,
    count,
    persist,
    flush,
  } as unknown as EntityManager;
  const transactional = vi.fn(async (callback: (em: EntityManager) => unknown) => {
    const snapshot = user ? createPowerfulAdmin(user) : null;

    try {
      return await callback(transactionalEntityManager);
    } catch (error) {
      if (user && snapshot) {
        Object.assign(user, snapshot);
      }
      throw error;
    }
  });
  const entityManager = {
    transactional,
  } as unknown as EntityManager;

  return {
    count,
    entityManager,
    execute,
    findOne,
    flush,
    persist,
    transactional,
    transactionalEntityManager,
    user,
  };
}

describe('AdminUserMutationRepository', () => {
  it('detects effective active powerful admins by permissions, not just admin role', () => {
    expect(hasActivePowerfulAdminAccess(createPowerfulAdmin())).toBe(true);
    expect(
      hasActivePowerfulAdminAccess(
        createPowerfulAdmin({
          permissions: [AdminUsersWritePermissionName],
        }),
      ),
    ).toBe(false);
    expect(hasActivePowerfulAdminAccess(createPowerfulAdmin({ roles: [AdminRoleName] }))).toBe(true);
    expect(hasActivePowerfulAdminAccess(createPowerfulAdmin({ status: 'disabled' }))).toBe(false);
  });

  it('mutates user, audit log, and outbox row in one locked transaction', async () => {
    const { entityManager, execute, findOne, count, persist, flush, user } = createEntityManagerMock({
      powerfulAdminCount: 2,
    });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId,
      actorUserId,
      action: 'admin.user.status.update',
      policy: { status: 'disabled' },
      audit: { metadata: { requestId: 'req-1' } },
    });

    const mutation = result._unsafeUnwrap();
    expect(mutation?.before.status).toBe('active');
    expect(mutation?.after.status).toBe('disabled');
    expect(user?.status).toBe('disabled');
    expect(execute).toHaveBeenCalledWith('select pg_advisory_xact_lock(hashtext(?))', [
      `admin-user-sensitive-mutation:${tenantId}`,
    ]);
    expect(findOne).toHaveBeenCalledWith(
      AuthUserEntity,
      { id: targetUserId, tenantId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    expect(count).toHaveBeenCalledWith(AuthUserEntity, {
      tenantId,
      status: 'active',
      roles: { $contains: [AdminRoleName] },
      permissions: {
        $contains: [AdminUsersWritePermissionName, AdminUsersAccessPolicyUpdatePermissionName],
      },
    });
    expect(persist).toHaveBeenCalledWith([expect.any(AdminAuditLogEntity), expect.any(TransactionalOutboxEventEntity)]);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(mutation?.auditLog).toMatchObject({
      action: 'admin.user.status.update',
      before: { status: 'active' },
      after: { status: 'disabled' },
      metadata: { requestId: 'req-1' },
    });
    expect(mutation?.outboxEvent).toMatchObject({
      aggregateType: 'admin.user',
      aggregateId: targetUserId,
      eventType: 'admin.user.status.update',
      status: 'pending',
      metadata: { requestId: 'req-1' },
    });
  });

  it('blocks removing the only powerful admin even when another active admin role holder exists without permissions', async () => {
    const { entityManager, persist, flush } = createEntityManagerMock({
      powerfulAdminCount: 1,
    });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId,
      actorUserId,
      action: 'admin.user.access_policy.update',
      policy: {
        roles: [AdminRoleName],
        permissions: [AdminUsersWritePermissionName],
      },
      audit: { metadata: { requestId: 'req-1' } },
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'At least one active administrator must retain admin write access.',
    });
    expect(persist).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it('rolls back mutation when audit or outbox persistence fails', async () => {
    const { entityManager, user } = createEntityManagerMock({
      flush: () => Promise.reject(new Error('audit insert failed')),
    });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId,
      actorUserId,
      action: 'admin.user.status.update',
      policy: { status: 'disabled' },
      audit: { metadata: { requestId: 'req-1' } },
    });

    expect(user?.status).toBe('active');
    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'audit insert failed',
    });
  });

  it('returns null for missing users without writing audit or outbox rows', async () => {
    const { entityManager, persist, flush } = createEntityManagerMock({
      user: null,
    });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId,
      actorUserId,
      action: 'admin.user.status.update',
      policy: { status: 'disabled' },
      audit: { metadata: {} },
    });

    expect(result._unsafeUnwrap()).toBeNull();
    expect(persist).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it('blocks an administrator from removing their own active admin write access', async () => {
    const { entityManager } = createEntityManagerMock({
      powerfulAdminCount: 5,
    });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId,
      actorUserId: targetUserId,
      action: 'admin.user.access_policy.update',
      policy: { permissions: [] },
      audit: { metadata: {} },
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'Administrators cannot remove their own active admin write access.',
    });
  });

  it('defaults the tenant and honours an explicit audit actor without metadata', async () => {
    const { entityManager } = createEntityManagerMock({
      powerfulAdminCount: 2,
    });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateAccessPolicyWithAudit({
      targetUserId,
      actorUserId,
      action: 'admin.user.status.update',
      policy: { status: 'active' },
      audit: { actorUserId: '99999999-9999-4999-8999-999999999999' },
    });

    const mutation = result._unsafeUnwrap();
    expect(mutation?.auditLog.actorUserId).toBe('99999999-9999-4999-8999-999999999999');
    expect(mutation?.auditLog.metadata).toEqual({});
    expect(mutation?.outboxEvent.metadata).toEqual({});
  });

  it('maps non-error mutation failures to a stable message', async () => {
    const entityManager = {
      transactional: vi.fn().mockRejectedValue('boom'),
    } as unknown as EntityManager;
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateAccessPolicyWithAudit({
      tenantId,
      targetUserId,
      actorUserId,
      action: 'admin.user.status.update',
      policy: { status: 'disabled' },
      audit: { metadata: {} },
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'Admin user mutation repository failed.',
    });
  });
});

const userRole = new AuthRoleEntity({ key: 'user' });
userRole.id = 'role-user';
const adminRole = new AuthRoleEntity({ key: 'admin' });
adminRole.id = 'role-admin';
const permProfile = new AuthPermissionEntity({
  key: 'profile:read',
  resource: 'profile',
  action: 'read',
});
permProfile.id = 'perm-profile';
const permUsersWrite = new AuthPermissionEntity({
  key: AdminUsersWritePermissionName,
  resource: 'admin.users',
  action: 'write',
});
permUsersWrite.id = 'perm-users-write';
const permAccessPolicy = new AuthPermissionEntity({
  key: AdminUsersAccessPolicyUpdatePermissionName,
  resource: 'admin.users',
  action: 'access-policy:update',
});
permAccessPolicy.id = 'perm-access-policy';

// Build a transactional EntityManager mock whose auth_user_roles reads return
// `existingAssignments` on the first call (reconcile) and `finalAssignments` on
// the second (effective-access resolution), simulating the post-reconcile state.
function buildRoleMutationEm(input: {
  user: AuthUserEntity | null;
  powerfulAdminCount: number;
  desiredRoles: AuthRoleEntity[];
  existingAssignments: AuthUserRoleEntity[];
  finalAssignments: AuthUserRoleEntity[];
  finalRoles: AuthRoleEntity[];
  finalRolePermissions: AuthRolePermissionEntity[];
  finalPermissions: AuthPermissionEntity[];
}) {
  let userRoleReads = 0;
  const persist = vi.fn();
  const nativeDelete = vi.fn(() => Promise.resolve(1));
  const flush = vi.fn(() => Promise.resolve());
  const execute = vi.fn(() => Promise.resolve());
  const count = vi.fn(() => Promise.resolve(input.powerfulAdminCount));
  const findOne = vi.fn(() => Promise.resolve(input.user));
  const find = vi.fn((entity: unknown, where: Record<string, unknown>) => {
    if (entity === AuthRoleEntity) {
      return Promise.resolve(where.key ? input.desiredRoles : input.finalRoles);
    }
    if (entity === AuthUserRoleEntity) {
      userRoleReads += 1;
      return Promise.resolve(userRoleReads === 1 ? input.existingAssignments : input.finalAssignments);
    }
    if (entity === AuthRolePermissionEntity) {
      return Promise.resolve(input.finalRolePermissions);
    }
    return Promise.resolve(input.finalPermissions);
  });
  const txEm = {
    getConnection: () => ({ execute }),
    findOne,
    count,
    find,
    persist,
    nativeDelete,
    flush,
  } as unknown as EntityManager;
  const transactional = vi.fn((callback: (em: EntityManager) => unknown) => callback(txEm));
  const entityManager = { transactional } as unknown as EntityManager;

  return { entityManager, persist, nativeDelete, flush, find };
}

describe('AdminUserMutationRepository role assignment', () => {
  it('promotes a user by resolving effective access from the normalized tables', async () => {
    const user = new AuthUserEntity({
      tenantId,
      email: 'user@example.com',
      status: 'active',
      roles: ['user'],
      permissions: ['profile:read'],
    });
    user.id = targetUserId;
    const { entityManager, persist, nativeDelete } = buildRoleMutationEm({
      user,
      powerfulAdminCount: 2,
      desiredRoles: [userRole, adminRole],
      existingAssignments: [new AuthUserRoleEntity({ userId: targetUserId, roleId: 'role-user' })],
      finalAssignments: [
        new AuthUserRoleEntity({ userId: targetUserId, roleId: 'role-user' }),
        new AuthUserRoleEntity({ userId: targetUserId, roleId: 'role-admin' }),
      ],
      finalRoles: [userRole, adminRole],
      finalRolePermissions: [
        new AuthRolePermissionEntity({
          roleId: 'role-user',
          permissionId: 'perm-profile',
        }),
        new AuthRolePermissionEntity({
          roleId: 'role-admin',
          permissionId: 'perm-users-write',
        }),
        new AuthRolePermissionEntity({
          roleId: 'role-admin',
          permissionId: 'perm-access-policy',
        }),
      ],
      finalPermissions: [permProfile, permUsersWrite, permAccessPolicy],
    });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateUserRolesWithAudit({
      tenantId,
      targetUserId,
      actorUserId,
      desiredRoleKeys: ['user', 'admin'],
      audit: { metadata: { requestId: 'req-1' } },
    });

    const mutation = result._unsafeUnwrap();
    expect(mutation?.after.roles).toEqual(['user', 'admin']);
    expect(mutation?.after.permissions).toEqual([
      'profile:read',
      AdminUsersWritePermissionName,
      AdminUsersAccessPolicyUpdatePermissionName,
    ]);
    expect(mutation?.auditLog.action).toBe('admin.user.roles.update');
    expect(mutation?.outboxEvent.eventType).toBe('admin.user.roles.update');
    // One assignment insert plus the [auditLog, outboxEvent] persist.
    expect(persist).toHaveBeenCalledTimes(2);
    expect(nativeDelete).not.toHaveBeenCalled();
  });

  it('blocks demoting the last powerful admin', async () => {
    const user = new AuthUserEntity({
      tenantId,
      email: 'admin@example.com',
      status: 'active',
      roles: [AdminRoleName],
      permissions: [AdminUsersWritePermissionName, AdminUsersAccessPolicyUpdatePermissionName],
    });
    user.id = targetUserId;
    const { entityManager } = buildRoleMutationEm({
      user,
      powerfulAdminCount: 1,
      desiredRoles: [userRole],
      existingAssignments: [new AuthUserRoleEntity({ userId: targetUserId, roleId: 'role-admin' })],
      finalAssignments: [new AuthUserRoleEntity({ userId: targetUserId, roleId: 'role-user' })],
      finalRoles: [userRole],
      finalRolePermissions: [
        new AuthRolePermissionEntity({
          roleId: 'role-user',
          permissionId: 'perm-profile',
        }),
      ],
      finalPermissions: [permProfile],
    });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateUserRolesWithAudit({
      tenantId,
      targetUserId,
      actorUserId,
      desiredRoleKeys: ['user'],
      audit: { metadata: {} },
    });

    expect(result._unsafeUnwrapErr()).toEqual({
      code: 'repository_error',
      message: 'At least one active administrator must retain admin write access.',
    });
  });

  it('returns null when the target user is missing', async () => {
    const { entityManager, persist } = buildRoleMutationEm({
      user: null,
      powerfulAdminCount: 2,
      desiredRoles: [],
      existingAssignments: [],
      finalAssignments: [],
      finalRoles: [],
      finalRolePermissions: [],
      finalPermissions: [],
    });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateUserRolesWithAudit({
      tenantId,
      targetUserId,
      actorUserId,
      desiredRoleKeys: ['user'],
      audit: { metadata: {} },
    });

    expect(result._unsafeUnwrap()).toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });

  it('defaults the tenant and honours an explicit audit actor without metadata', async () => {
    const user = new AuthUserEntity({
      tenantId,
      email: 'user@example.com',
      status: 'active',
      roles: ['user'],
      permissions: ['profile:read'],
    });
    user.id = targetUserId;
    const { entityManager } = buildRoleMutationEm({
      user,
      powerfulAdminCount: 2,
      desiredRoles: [userRole],
      existingAssignments: [new AuthUserRoleEntity({ userId: targetUserId, roleId: 'role-user' })],
      finalAssignments: [new AuthUserRoleEntity({ userId: targetUserId, roleId: 'role-user' })],
      finalRoles: [userRole],
      finalRolePermissions: [
        new AuthRolePermissionEntity({
          roleId: 'role-user',
          permissionId: 'perm-profile',
        }),
      ],
      finalPermissions: [permProfile],
    });
    const repository = new AdminUserMutationRepository(entityManager);

    const result = await repository.mutateUserRolesWithAudit({
      targetUserId,
      actorUserId,
      desiredRoleKeys: ['user'],
      audit: { actorUserId: '99999999-9999-4999-8999-999999999999' },
    });

    const mutation = result._unsafeUnwrap();
    expect(mutation?.auditLog.actorUserId).toBe('99999999-9999-4999-8999-999999999999');
    expect(mutation?.auditLog.metadata).toEqual({});
    expect(mutation?.outboxEvent.metadata).toEqual({});
  });
});
