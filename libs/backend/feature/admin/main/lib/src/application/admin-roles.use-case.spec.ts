import { errAsync, okAsync, type ResultAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import {
  AdminRole,
  AdminRolesReadPermission,
  AdminRolesWritePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminUsersReadPermission,
  AdminUsersWritePermission,
  UserProfileReadPermission,
  UserRole,
} from '@app/common-authz';
import { AdminRolesUseCase } from './admin-roles.use-case';

const tenantId = '00000000-0000-0000-0000-000000000000';

const principal: AuthenticatedPrincipal = {
  subject: 'actor-id',
  tenantId,
  email: 'admin@example.com',
  roles: [AdminRole],
  permissions: [AdminRolesReadPermission, AdminRolesWritePermission],
};

const context = { requestId: 'req-1' };

interface FakeRole {
  id: string;
  key: string;
  label: string;
  description: string;
  isSystem: boolean;
}

interface TestRepositoryError {
  code: string;
  message: string;
}

type TestResult<T> = ResultAsync<T, TestRepositoryError>;

const role = (partial: Partial<FakeRole> = {}): FakeRole => ({
  id: 'role-admin',
  key: AdminRole,
  label: 'Administrator',
  description: '',
  isSystem: true,
  ...partial,
});

const permission = (key: string, resource: string, action: string) => ({
  key,
  resource,
  action,
  description: `${key} description`,
});

const createUser = () => ({
  id: 'user-id',
  tenantId,
  email: 'user@example.com',
  displayName: 'User',
  status: 'active' as const,
  roles: [UserRole, AdminRole],
  permissions: [UserProfileReadPermission, AdminUsersReadPermission],
  locale: 'en',
  theme: 'system',
  lastLoginAt: new Date(0),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
});

const createDeps = () => {
  const roles = {
    listRolesWithPermissions: vi.fn(() =>
      okAsync([
        {
          role: role({ id: 'role-user', key: UserRole, label: 'User' }),
          permissionKeys: [UserProfileReadPermission],
        },
        {
          role: role(),
          permissionKeys: [
            AdminUsersWritePermission,
            AdminUsersAccessPolicyUpdatePermission,
            AdminRolesWritePermission,
          ],
        },
      ]),
    ),
    listPermissions: vi.fn(() =>
      okAsync([
        permission(AdminUsersReadPermission, 'admin.users', 'read'),
        permission(UserProfileReadPermission, 'profile', 'read'),
      ]),
    ),
    findByKey: vi.fn((): TestResult<FakeRole | null> => okAsync(null)),
    findById: vi.fn((): TestResult<FakeRole | null> => okAsync(role())),
    findByKeys: vi.fn(() => okAsync([role({ key: UserRole }), role({ key: AdminRole })])),
    createRole: vi.fn((): TestResult<FakeRole> => okAsync(role({ id: 'role-new', key: 'support', isSystem: false }))),
    updateRole: vi.fn((): TestResult<FakeRole | null> => okAsync(role())),
    setRolePermissions: vi.fn((): TestResult<{ role: FakeRole; permissionKeys: string[] } | null> =>
      okAsync({ role: role({ id: 'role-new' }), permissionKeys: [] }),
    ),
  };
  const adminUserMutations = {
    mutateUserRolesWithAudit: vi.fn(
      (): TestResult<{
        before: ReturnType<typeof createUser>;
        after: ReturnType<typeof createUser>;
        auditLog: Record<string, unknown>;
        outboxEvent: Record<string, unknown>;
      } | null> =>
        okAsync({
          before: createUser(),
          after: createUser(),
          auditLog: {},
          outboxEvent: {},
        }),
    ),
  };

  return {
    roles,
    adminUserMutations,
    useCase: new AdminRolesUseCase(roles as never, adminUserMutations as never),
  };
};

describe('AdminRolesUseCase', () => {
  it('lists the DB-backed catalog with roles, permissions, and assignables', async () => {
    const { useCase } = createDeps();

    const catalog = await useCase.listRolesCatalog(principal);

    expect(catalog.roles.map((entry) => entry.role)).toEqual([UserRole, AdminRole]);
    expect(catalog.roles[1]).toMatchObject({
      id: 'role-admin',
      role: AdminRole,
      isSystem: true,
    });
    // permissions ordered by catalog index: profile:read precedes admin:users:read.
    expect(catalog.permissions.map((entry) => entry.permission)).toEqual([
      UserProfileReadPermission,
      AdminUsersReadPermission,
    ]);
    expect(catalog.assignableRoles).toEqual([UserRole, AdminRole]);
    expect(catalog.assignablePermissions).toContain(AdminUsersReadPermission);
    expect(catalog.resources).toEqual(['admin.users', 'profile']);
  });

  it('creates a role and applies its permission grants', async () => {
    const { roles, useCase } = createDeps();

    const created = await useCase.createRole(principal, {
      key: ' support ',
      label: 'Support',
      permissions: [AdminUsersReadPermission],
    });

    expect(roles.findByKey).toHaveBeenCalledWith('support', tenantId);
    expect(roles.createRole).toHaveBeenCalledWith({
      tenantId,
      key: 'support',
      label: 'Support',
      description: undefined,
      isSystem: false,
    });
    expect(roles.setRolePermissions).toHaveBeenCalledWith('role-new', [AdminUsersReadPermission], tenantId);
    expect(created.id).toBe('role-new');
  });

  it('rejects duplicate role keys with a conflict', async () => {
    const { roles, useCase } = createDeps();
    roles.findByKey.mockReturnValue(okAsync(role({ key: 'support' })));

    await expect(useCase.createRole(principal, { key: 'support' })).rejects.toThrow(/already exists/);
    expect(roles.createRole).not.toHaveBeenCalled();
  });

  it('rejects unknown permission keys', async () => {
    const { useCase } = createDeps();

    await expect(
      useCase.createRole(principal, {
        key: 'support',
        permissions: ['admin:unknown:read'],
      }),
    ).rejects.toThrow(/Unknown permission keys/);
  });

  it("blocks stripping the admin role's core management grants", async () => {
    const { roles, useCase } = createDeps();

    await expect(
      useCase.setRolePermissions(principal, 'role-admin', {
        permissions: [AdminUsersReadPermission],
      }),
    ).rejects.toThrow(/core management grants/);
    expect(roles.setRolePermissions).not.toHaveBeenCalled();
  });

  it("sets a role's permission set when invariants are preserved", async () => {
    const { roles, useCase } = createDeps();
    roles.setRolePermissions.mockReturnValue(
      okAsync({
        role: role(),
        permissionKeys: [AdminUsersWritePermission, AdminUsersAccessPolicyUpdatePermission, AdminRolesWritePermission],
      }),
    );

    const updated = await useCase.setRolePermissions(principal, 'role-admin', {
      permissions: [AdminUsersWritePermission, AdminUsersAccessPolicyUpdatePermission, AdminRolesWritePermission],
    });

    expect(updated.permissions).toContain(AdminRolesWritePermission);
  });

  it('assigns user roles through the audited sensitive mutation', async () => {
    const { adminUserMutations, useCase } = createDeps();

    const view = await useCase.assignUserRoles(principal, 'user-id', { roles: [UserRole, AdminRole] }, context);

    expect(adminUserMutations.mutateUserRolesWithAudit).toHaveBeenCalledWith({
      tenantId,
      targetUserId: 'user-id',
      actorUserId: 'actor-id',
      desiredRoleKeys: [UserRole, AdminRole],
      audit: { actorUserId: 'actor-id', metadata: { requestId: 'req-1' } },
    });
    expect(view.roles).toEqual([UserRole, AdminRole]);
  });

  it('rejects assigning role keys that do not exist for the tenant', async () => {
    const { roles, adminUserMutations, useCase } = createDeps();
    roles.findByKeys.mockReturnValue(okAsync([role({ key: AdminRole })]));

    await expect(
      useCase.assignUserRoles(principal, 'user-id', { roles: [AdminRole, 'ghost'] }, context),
    ).rejects.toThrow(/Unknown role keys/);
    expect(adminUserMutations.mutateUserRolesWithAudit).not.toHaveBeenCalled();
  });

  it('surfaces sensitive safety violations from role assignment', async () => {
    const { adminUserMutations, useCase } = createDeps();
    adminUserMutations.mutateUserRolesWithAudit.mockReturnValue(
      errAsync({
        code: 'repository_error',
        message: 'At least one active administrator must retain admin write access.',
      }),
    );

    await expect(useCase.assignUserRoles(principal, 'user-id', { roles: [UserRole] }, context)).rejects.toThrow(
      /At least one active administrator/,
    );
  });

  it('returns 404 semantics when the target user is missing', async () => {
    const { adminUserMutations, useCase } = createDeps();
    adminUserMutations.mutateUserRolesWithAudit.mockReturnValue(okAsync(null));

    await expect(useCase.assignUserRoles(principal, 'missing', { roles: [UserRole] }, context)).rejects.toThrow(
      /was not found/,
    );
  });

  it('rejects a blank role key', async () => {
    const { roles, useCase } = createDeps();

    await expect(useCase.createRole(principal, { key: '   ' })).rejects.toThrow(/role key is required/);
    expect(roles.createRole).not.toHaveBeenCalled();
  });

  it('creates a role without permission grants', async () => {
    const { roles, useCase } = createDeps();

    const created = await useCase.createRole(principal, { key: 'support' });

    expect(roles.setRolePermissions).not.toHaveBeenCalled();
    expect(created.role).toBe('support');
  });

  it('surfaces a missing role when applying grants to a freshly created role', async () => {
    const { roles, useCase } = createDeps();
    roles.setRolePermissions.mockReturnValue(okAsync(null));

    await expect(
      useCase.createRole(principal, {
        key: 'support',
        permissions: [AdminUsersReadPermission],
      }),
    ).rejects.toThrow(/was not found/);
  });

  it('updates a role description and re-reads its catalog view', async () => {
    const { roles, useCase } = createDeps();

    const updated = await useCase.updateRole(principal, 'role-admin', {
      description: 'Ops team',
    });

    expect(roles.updateRole).toHaveBeenCalledWith('role-admin', { description: 'Ops team' }, tenantId);
    expect(updated.id).toBe('role-admin');
  });

  it('returns 404 when updating a role that does not exist', async () => {
    const { roles, useCase } = createDeps();
    roles.updateRole.mockReturnValue(okAsync(null));

    await expect(useCase.updateRole(principal, 'ghost', { label: 'Ops' })).rejects.toThrow(/was not found/);
  });

  it('returns 404 when the updated role is absent from the catalog', async () => {
    const { roles, useCase } = createDeps();
    roles.updateRole.mockReturnValue(okAsync(role({ id: 'role-ghost' })));

    await expect(useCase.updateRole(principal, 'role-ghost', { label: 'Ops' })).rejects.toThrow(/was not found/);
  });

  it('returns 404 when setting permissions on an unknown role', async () => {
    const { roles, useCase } = createDeps();
    roles.findById.mockReturnValue(okAsync(null));

    await expect(
      useCase.setRolePermissions(principal, 'ghost', {
        permissions: [AdminUsersReadPermission],
      }),
    ).rejects.toThrow(/was not found/);
  });

  it('sets permissions on a non-system role without invariant checks', async () => {
    const { roles, useCase } = createDeps();
    roles.findById.mockReturnValue(okAsync(role({ id: 'role-support', key: 'support', isSystem: false })));
    roles.setRolePermissions.mockReturnValue(
      okAsync({
        role: role({ id: 'role-support', key: 'support', isSystem: false }),
        permissionKeys: [AdminUsersReadPermission],
      }),
    );

    const updated = await useCase.setRolePermissions(principal, 'role-support', {
      permissions: [AdminUsersReadPermission],
    });

    expect(updated.permissions).toEqual([AdminUsersReadPermission]);
  });

  it('returns 404 when a permission update resolves to no role', async () => {
    const { roles, useCase } = createDeps();
    roles.findById.mockReturnValue(okAsync(role({ id: 'role-support', key: 'support', isSystem: false })));
    roles.setRolePermissions.mockReturnValue(okAsync(null));

    await expect(
      useCase.setRolePermissions(principal, 'role-support', {
        permissions: [AdminUsersReadPermission],
      }),
    ).rejects.toThrow(/was not found/);
  });

  it('assigns an empty role set without a tenant role lookup', async () => {
    const { roles, adminUserMutations, useCase } = createDeps();

    await useCase.assignUserRoles(principal, 'user-id', { roles: [] }, context);

    expect(roles.findByKeys).not.toHaveBeenCalled();
    expect(adminUserMutations.mutateUserRolesWithAudit).toHaveBeenCalledWith(
      expect.objectContaining({ desiredRoleKeys: [] }),
    );
  });
});
