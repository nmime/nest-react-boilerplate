// @requirements REQ-AUTH-TENANT-004
import { Reflector } from '@nestjs/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { basePermissionCatalog, defaultRolePermissions } from '@app/common-authz';
import {
  DefaultAuthTenantId,
  type AuthenticatedPrincipal,
  type PermissionEvaluationContext,
} from '@app/backend-feature-auth-shared';
import {
  AdminAuditReadPermission,
  AdminDashboardReadPermission,
  AdminManageAction,
  AdminManageAllPermission,
  AdminAllResource,
  AdminProfileReadPermission,
  AdminRole,
  AdminRolesReadPermission,
  AdminRolesWritePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminUsersReadPermission,
  AdminUsersStatusUpdatePermission,
  UserProfileReadPermission,
  UserRole,
  adminAssignablePermissions,
  adminPermissionCatalog,
  adminResources,
  adminRoleCatalog,
  assertAdminProfilePermission,
  canAdmin,
  cannotAdmin,
  createAdminAbility,
  createAdminAccessPolicy,
  isAdminAssignablePermission,
  isAdminAssignableRole,
  isKnownAdminPermission,
  toAdminProfileView,
  toAdminRbacCatalogView,
  type AdminAuthorizedRequest,
} from './index';

const adminPrincipal = {
  subject: 'admin-id',
  email: 'admin@example.com',
  displayName: 'Ada Admin',
  locale: 'ru',
  roles: [AdminRole, AdminRole],
  permissions: [AdminProfileReadPermission, AdminDashboardReadPermission],
};

describe('@app/backend-feature-admin-shared CASL RBAC', () => {
  it('derives an admin CASL ability from explicit RBAC roles and permissions', () => {
    const ability = createAdminAbility({
      subject: 'admin-id',
      roles: [AdminRole],
      permissions: [
        AdminDashboardReadPermission,
        AdminUsersReadPermission,
        AdminUsersStatusUpdatePermission,
        AdminUsersAccessPolicyUpdatePermission,
      ],
    });

    expect(canAdmin(ability, 'read', 'admin.dashboard')).toBe(true);
    expect(canAdmin(ability, 'read', 'admin.users')).toBe(true);
    expect(canAdmin(ability, 'status:update', 'admin.users')).toBe(true);
    expect(canAdmin(ability, 'access-policy:update', 'admin.users')).toBe(true);
    expect(cannotAdmin(ability, 'read', 'admin.audit')).toBe(true);
  });

  it('grants profile and dashboard access for admin principals', () => {
    expect(createAdminAccessPolicy(adminPrincipal)).toEqual({
      isAuthenticated: true,
      roles: [AdminRole],
      permissions: [AdminProfileReadPermission, AdminDashboardReadPermission],
      canAccessAdmin: true,
      canReadDashboard: true,
      canReadProfile: true,
      canReadUsers: false,
      canUpdateUserStatus: false,
      canUpdateUserAccessPolicy: false,
      canReadRoles: false,
      canReadAudit: false,
      canReadFeatureFlags: false,
      canWriteFeatureFlags: false,
      canReadSettings: false,
      canUpdateSettings: false,
    });
  });

  it('keeps RBAC fail-closed without an authenticated identity', () => {
    expect(createAdminAccessPolicy()).toEqual({
      isAuthenticated: false,
      roles: [],
      permissions: [],
      canAccessAdmin: false,
      canReadDashboard: false,
      canReadProfile: false,
      canReadUsers: false,
      canUpdateUserStatus: false,
      canUpdateUserAccessPolicy: false,
      canReadRoles: false,
      canReadAudit: false,
      canReadFeatureFlags: false,
      canWriteFeatureFlags: false,
      canReadSettings: false,
      canUpdateSettings: false,
    });
    expect(
      createAdminAccessPolicy({
        subject: 'support-id',
        roles: ['support'],
        permissions: [AdminProfileReadPermission],
      }),
    ).toMatchObject({ canAccessAdmin: true, canReadProfile: true });
  });

  it('denies admin role alone without explicit permissions', () => {
    expect(
      createAdminAccessPolicy({
        subject: 'admin-id',
        roles: [AdminRole],
        permissions: [],
      }),
    ).toMatchObject({
      canAccessAdmin: false,
      canReadDashboard: false,
      canReadProfile: false,
      canReadUsers: false,
    });
  });

  it('accepts database-resolved custom roles when their permissions are present', () => {
    expect(
      createAdminAccessPolicy({
        subject: 'support-id',
        roles: ['support'],
        permissions: [AdminUsersReadPermission, AdminAuditReadPermission],
      }),
    ).toMatchObject({ canAccessAdmin: true, canReadAudit: true, canReadUsers: true });
  });

  it('ignores unknown admin permission strings while exposing catalog validation', () => {
    expect(isKnownAdminPermission('admin:unknown:read')).toBe(false);
    expect(
      createAdminAccessPolicy({
        subject: 'admin-id',
        roles: [AdminRole],
        permissions: ['admin:unknown:read', AdminRolesReadPermission],
      }),
    ).toMatchObject({
      canAccessAdmin: true,
      canReadRoles: true,
      canReadUsers: false,
    });
  });

  it('requires explicit manage/all permission for global admin management', () => {
    const abilityWithoutManageAll = createAdminAbility({
      subject: 'admin-id',
      roles: [AdminRole],
      permissions: [AdminDashboardReadPermission],
    });
    const abilityWithManageAll = createAdminAbility({
      subject: 'admin-id',
      roles: [AdminRole],
      permissions: [AdminManageAllPermission],
    });

    expect(canAdmin(abilityWithoutManageAll, AdminManageAction, AdminAllResource)).toBe(false);
    expect(canAdmin(abilityWithManageAll, AdminManageAction, AdminAllResource)).toBe(true);
    expect(canAdmin(abilityWithManageAll, 'read', 'admin.audit')).toBe(true);
    expect(
      createAdminAccessPolicy({
        subject: 'admin-id',
        roles: [AdminRole],
        permissions: [AdminManageAllPermission],
      }).canAccessAdmin,
    ).toBe(true);
  });

  it('builds a safe admin profile view and rejects missing permission', () => {
    expect(toAdminProfileView(adminPrincipal)).toEqual({
      id: 'admin-id',
      email: 'admin@example.com',
      displayName: 'Ada Admin',
      locale: 'ru',
      roles: [AdminRole],
      permissions: [AdminProfileReadPermission, AdminDashboardReadPermission],
    });
    expect(assertAdminProfilePermission(adminPrincipal)).toBe(adminPrincipal);
    expect(() =>
      assertAdminProfilePermission({
        subject: 'admin-id',
        roles: [AdminRole],
        permissions: [],
      }),
    ).toThrow('Admin profile permission is required.');
  });

  it('exposes the DB-manageable admin:roles:write grant in the shared catalog', () => {
    expect(isKnownAdminPermission(AdminRolesWritePermission)).toBe(true);
    expect(isAdminAssignablePermission(AdminRolesWritePermission)).toBe(true);
    expect(adminPermissionCatalog.some((entry) => entry.permission === AdminRolesWritePermission)).toBe(true);
  });

  it('classifies assignable roles and permissions for RBAC admin UIs', () => {
    expect(isAdminAssignableRole(AdminRole)).toBe(true);
    expect(isAdminAssignableRole(UserRole)).toBe(true);
    expect(isAdminAssignableRole('superadmin')).toBe(false);
    expect(isAdminAssignablePermission(AdminProfileReadPermission)).toBe(true);
    expect(isAdminAssignablePermission(UserProfileReadPermission)).toBe(true);
    expect(isAdminAssignablePermission('admin:unknown:read')).toBe(false);
  });

  it('exposes the RBAC catalog view consumed by admin clients', () => {
    const view = toAdminRbacCatalogView();

    expect(view.resources).toBe(adminResources);
    expect(view.roles).toBe(adminRoleCatalog);
    expect(view.permissions).toBe(adminPermissionCatalog);
    expect(view.assignableRoles).toContain(AdminRole);
    expect(view.assignablePermissions).toContain(AdminProfileReadPermission);
  });

  it('evaluates permissions from raw principal claims without a prebuilt ability', () => {
    const principal = {
      subject: 'admin-id',
      roles: [AdminRole],
      permissions: [AdminDashboardReadPermission],
    };

    expect(canAdmin(principal, 'read', 'admin.dashboard')).toBe(true);
    expect(cannotAdmin(principal, 'read', 'admin.audit')).toBe(true);
  });

  it('ignores roles absent from the RBAC matrix while still honoring the admin role', () => {
    const ability = createAdminAbility({
      subject: 'admin-id',
      roles: ['ghost-role', AdminRole],
      permissions: [AdminDashboardReadPermission],
    });

    expect(canAdmin(ability, 'read', 'admin.dashboard')).toBe(true);
  });

  it('normalizes raw role and permission claims defensively', () => {
    const policy = createAdminAccessPolicy({
      subject: 'admin-id',
      roles: 'admin' as unknown as string[],
      permissions: [
        AdminDashboardReadPermission,
        AdminDashboardReadPermission,
        '   ',
        42 as unknown as string,
        ` ${AdminProfileReadPermission} `,
      ],
    });

    expect(policy.roles).toEqual([]);
    expect(policy.permissions).toEqual([AdminDashboardReadPermission, AdminProfileReadPermission]);
    expect(policy.canAccessAdmin).toBe(true);
  });
});

// A product permission held by a role other than the boilerplate's own `admin` must still reach
// every admin surface: assignment, the CASL vocabulary and the guard. The mock composes the real
// catalog with one extension, so these assert the composition seam rather than a stubbed shape.
const productExtension = {
  id: 'ops',
  permissions: [{ key: 'ops:jobs:read', resource: 'ops.jobs', action: 'read', description: 'Read operations jobs.' }],
  grants: [{ role: 'operator', permissions: ['ops:jobs:read'] }],
};

const importWithProductExtension = async (): Promise<typeof import('./index')> => {
  vi.resetModules();
  vi.doMock('@app/common-authz', async () => {
    const actual = await vi.importActual<typeof import('@app/common-authz')>('@app/common-authz');
    const composed = actual.composeAuthzCatalog({
      permissions: actual.basePermissionCatalog,
      grants: actual.baseRolePermissions,
      extensions: [productExtension],
    });

    return {
      ...actual,
      permissionCatalog: composed.permissions,
      roleKeys: composed.roles,
      rolePermissions: composed.rolePermissions,
      defaultRolePermissions: composed.rolePermissions,
    };
  });

  return import('./index');
};

afterEach(() => {
  vi.doUnmock('@app/common-authz');
  vi.resetModules();
});

describe('@app/backend-feature-admin-shared product permission seam', () => {
  it('makes a product permission assignable even when the admin role does not hold it', async () => {
    const admin = await importWithProductExtension();

    expect(admin.adminAssignablePermissions).toContain('ops:jobs:read');
    expect(admin.isAdminAssignablePermission('ops:jobs:read')).toBe(true);
    expect(admin.isKnownAdminPermission('ops:jobs:read')).toBe(true);
  });

  it('maps a product permission onto its CASL action and resource', async () => {
    const admin = await importWithProductExtension();

    expect(admin.adminPermissionToAbility('ops:jobs:read')).toEqual({ action: 'read', resource: 'ops.jobs' });
  });

  it('lists a composed product role as assignable, keyed on its own grants', async () => {
    const admin = await importWithProductExtension();

    expect(admin.adminAssignableRoles).toContain('operator');
    expect(admin.isAdminAssignableRole('operator')).toBe(true);
    expect(admin.adminRoleCatalog).toContainEqual({
      role: 'operator',
      label: 'operator',
      description: 'operator',
      permissions: ['ops:jobs:read'],
    });
  });

  it('authorizes an admin route guarded by a product permission', async () => {
    const admin = await importWithProductExtension();
    class ExposedAdminRbacGuard extends admin.AdminRbacGuard {
      evaluate(context: PermissionEvaluationContext): boolean | undefined {
        return this.evaluateDomainPermission(context);
      }
    }
    const principal: AuthenticatedPrincipal = {
      subject: 'operator-id',
      roles: ['operator'],
      permissions: ['ops:jobs:read'],
      tenantId: DefaultAuthTenantId,
    };
    const request: AdminAuthorizedRequest = {
      user: principal,
      adminAbility: admin.createAdminAbility(principal),
    };

    expect(
      new ExposedAdminRbacGuard(new Reflector()).evaluate({
        permission: 'ops:jobs:read',
        principal,
        request,
        requiredRoles: ['operator'],
      }),
    ).toBe(true);
  });

  it('leaves the boilerplate catalog untouched when no product registers anything', () => {
    expect(adminAssignablePermissions).toEqual(basePermissionCatalog.map((entry) => entry.key));
    expect(adminRoleCatalog).toEqual([
      {
        role: UserRole,
        label: 'User',
        description: 'Baseline application user role.',
        permissions: defaultRolePermissions[UserRole],
      },
      {
        role: AdminRole,
        label: 'Administrator',
        description: 'Back-office administrator with explicit granular grants.',
        permissions: defaultRolePermissions[AdminRole],
      },
    ]);
  });

  it('turns on every access-policy flag for a principal holding the whole admin catalog', () => {
    const policy = createAdminAccessPolicy({
      subject: 'admin-id',
      roles: [AdminRole],
      permissions: adminPermissionCatalog.map((entry) => entry.permission),
    });

    const flags = Object.entries(policy).filter(([key]) => key.startsWith('can'));

    expect(flags.length).toBeGreaterThan(0);
    expect(flags.filter(([, granted]) => granted !== true)).toEqual([]);
  });
});
