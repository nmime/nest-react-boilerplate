// @requirements REQ-AUTH-TENANT-004
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { okAsync, type ResultAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import {
  AdminManageAllPermission,
  AdminRole,
  AdminRolesReadPermission,
  AdminRolesWritePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminUsersReadPermission,
  AdminUsersWritePermission,
  UserProfileReadPermission,
  UserRole,
} from '@app/common-authz';
import { AdminRolesUseCase } from '../../application';
import { AdminRolesController } from './admin-roles.controller';

const tenantId = '00000000-0000-0000-0000-000000000000';

const principal: AuthenticatedPrincipal = {
  subject: 'actor-id',
  tenantId,
  email: 'admin@example.com',
  roles: [AdminRole],
  permissions: [AdminRolesReadPermission, AdminRolesWritePermission],
};

const adminRole = {
  id: 'role-admin',
  key: AdminRole,
  label: 'Administrator',
  description: '',
  isSystem: true,
};

type TestRole = typeof adminRole & { key: string };
type TestResult<T> = ResultAsync<T, { code: string; message: string }>;

const createUser = () => ({
  id: 'user-id',
  tenantId,
  email: 'user@example.com',
  displayName: 'User',
  status: 'active' as const,
  roles: [UserRole, AdminRole],
  permissions: [UserProfileReadPermission],
  locale: 'en',
  theme: 'system',
  lastLoginAt: new Date(0),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
});

const createController = () => {
  const roles = {
    listRolesWithPermissions: vi.fn(() => okAsync([{ role: adminRole, permissionKeys: [AdminRolesWritePermission] }])),
    listPermissions: vi.fn(() =>
      okAsync([
        {
          key: AdminUsersReadPermission,
          resource: 'admin.users',
          action: 'read',
          description: 'read',
        },
      ]),
    ),
    findByKey: vi.fn((): TestResult<TestRole | null> => okAsync(null)),
    findById: vi.fn((): TestResult<TestRole | null> => okAsync(adminRole)),
    findByKeys: vi.fn(() => okAsync([{ ...adminRole, key: UserRole }, adminRole])),
    findPermissionsByKeys: vi.fn((keys: readonly string[]) => okAsync(keys.map((key) => ({ key })))),
    createRole: vi.fn((): TestResult<TestRole> =>
      okAsync({
        ...adminRole,
        id: 'role-new',
        key: 'support',
        isSystem: false,
      }),
    ),
    updateRole: vi.fn((): TestResult<TestRole | null> => okAsync(adminRole)),
    setRolePermissions: vi.fn((): TestResult<{ role: TestRole; permissionKeys: string[] } | null> =>
      okAsync({ role: { ...adminRole, id: 'role-new' }, permissionKeys: [] }),
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
    controller: new AdminRolesController(new AdminRolesUseCase(roles as never, adminUserMutations as never)),
  };
};

describe('AdminRolesController', () => {
  it('returns the DB-backed roles catalog envelope', async () => {
    const { controller } = createController();

    await expect(controller.listRoles(principal)).resolves.toMatchObject({
      data: {
        roles: [expect.objectContaining({ role: AdminRole, isSystem: true })],
        assignableRoles: [AdminRole],
      },
    });
  });

  it('creates a role', async () => {
    const { controller } = createController();

    await expect(controller.createRole(principal, { key: 'support' })).resolves.toMatchObject({
      data: { role: 'support' },
    });
  });

  it('maps duplicate role keys to 409 Conflict', async () => {
    const { controller, roles } = createController();
    roles.findByKey.mockReturnValue(okAsync({ ...adminRole, key: 'support' }));

    await expect(controller.createRole(principal, { key: 'support' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps stripping admin invariants to 400 Bad Request', async () => {
    const { controller } = createController();

    await expect(
      controller.setRolePermissions(principal, 'role-admin', {
        permissions: [AdminUsersReadPermission],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets role permissions when invariants are preserved', async () => {
    const { controller, roles } = createController();
    roles.setRolePermissions.mockReturnValue(
      okAsync({
        role: adminRole,
        permissionKeys: [
          AdminUsersWritePermission,
          AdminUsersAccessPolicyUpdatePermission,
          AdminRolesWritePermission,
          AdminManageAllPermission,
        ],
      }),
    );

    const response = await controller.setRolePermissions(principal, 'role-admin', {
      permissions: [
        AdminUsersWritePermission,
        AdminUsersAccessPolicyUpdatePermission,
        AdminRolesWritePermission,
        AdminManageAllPermission,
      ],
    });

    expect(response.data.permissions).toContain(AdminRolesWritePermission);
  });

  it("updates a role's label", async () => {
    const { controller } = createController();

    await expect(controller.updateRole(principal, 'role-admin', { label: 'Ops' })).resolves.toMatchObject({
      data: { role: AdminRole },
    });
  });

  it('assigns roles to a user and returns the updated view', async () => {
    const { controller } = createController();

    await expect(
      controller.assignUserRoles(
        principal,
        'user-id',
        { roles: [UserRole, AdminRole] },
        { headers: { 'x-request-id': 'req-1' } },
      ),
    ).resolves.toMatchObject({ data: { roles: [UserRole, AdminRole] } });
  });

  it('maps missing users to 404 Not Found', async () => {
    const { controller, adminUserMutations } = createController();
    adminUserMutations.mutateUserRolesWithAudit.mockReturnValue(okAsync(null));

    await expect(
      controller.assignUserRoles(principal, 'missing', { roles: [UserRole] }, { headers: {} }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
