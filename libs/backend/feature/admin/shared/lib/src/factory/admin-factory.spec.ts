// @requirements REQ-AUTH-TENANT-004
import { describe, expect, it } from 'vitest';
import {
  AdminAuditReadPermission,
  AdminDashboardReadPermission,
  AdminManageAllPermission,
  AdminProfileReadPermission,
  AdminRole,
  AdminRolesReadPermission,
  AdminSettingsReadPermission,
  AdminSettingsUpdatePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminUsersReadPermission,
  AdminUsersStatusUpdatePermission,
  UserProfileReadPermission,
  UserRole,
  defaultRolePermissions,
} from '@app/common-authz';
import { AdminAllResource, AdminManageAction, adminActions, adminResources } from '../const';
import { createAdminAccessPolicy } from './admin-access-policy.factory';
import {
  adminAssignablePermissions,
  adminAssignableRoles,
  adminPermissionCatalog,
  adminRoleCatalog,
  adminRolePermissionMatrix,
} from './admin-permission-catalog.factory';

describe('admin CASL constants', () => {
  it('exposes the action and resource vocabulary', () => {
    expect(AdminManageAction).toBe('manage');
    expect(AdminAllResource).toBe('all');
    expect(adminActions).toContain(AdminManageAction);
    expect(adminResources).toContain('admin.users');
  });
});

describe('admin permission catalog factory', () => {
  it('projects assignable roles and permissions from the shared authz catalog', () => {
    expect(adminRolePermissionMatrix).toBe(defaultRolePermissions);
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
    expect(adminAssignableRoles).toEqual([UserRole, AdminRole]);
    expect(adminAssignablePermissions[0]).toBe(UserProfileReadPermission);
    expect(adminPermissionCatalog.map((entry) => entry.permission)).toContain(AdminUsersReadPermission);
  });
});

describe('createAdminAccessPolicy factory', () => {
  it('fails closed without authenticated claims', () => {
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
      canReadSettings: false,
      canUpdateSettings: false,
    });
  });

  it('derives every granular access flag from explicit admin permissions', () => {
    expect(
      createAdminAccessPolicy({
        subject: 'admin-id',
        roles: [AdminRole],
        permissions: [
          AdminProfileReadPermission,
          AdminDashboardReadPermission,
          AdminUsersReadPermission,
          AdminUsersStatusUpdatePermission,
          AdminUsersAccessPolicyUpdatePermission,
          AdminRolesReadPermission,
          AdminAuditReadPermission,
          AdminSettingsReadPermission,
          AdminSettingsUpdatePermission,
        ],
      }),
    ).toEqual({
      isAuthenticated: true,
      roles: [AdminRole],
      permissions: [
        AdminProfileReadPermission,
        AdminDashboardReadPermission,
        AdminUsersReadPermission,
        AdminUsersStatusUpdatePermission,
        AdminUsersAccessPolicyUpdatePermission,
        AdminRolesReadPermission,
        AdminAuditReadPermission,
        AdminSettingsReadPermission,
        AdminSettingsUpdatePermission,
      ],
      canAccessAdmin: true,
      canReadDashboard: true,
      canReadProfile: true,
      canReadUsers: true,
      canUpdateUserStatus: true,
      canUpdateUserAccessPolicy: true,
      canReadRoles: true,
      canReadAudit: true,
      canReadSettings: true,
      canUpdateSettings: true,
    });
  });

  it('allows admin access through the explicit manage-all permission', () => {
    expect(
      createAdminAccessPolicy({
        subject: 'admin-id',
        roles: [AdminRole],
        permissions: [AdminManageAllPermission],
      }),
    ).toMatchObject({
      canAccessAdmin: true,
      canReadDashboard: true,
    });
  });
});
