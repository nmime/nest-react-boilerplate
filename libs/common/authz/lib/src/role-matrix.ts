import {
  AdminAuditReadPermission,
  AdminAuthLoginAnalyticsReadPermission,
  AdminDashboardReadPermission,
  AdminManageAllPermission,
  AdminProfileReadPermission,
  AdminRolesReadPermission,
  AdminRolesWritePermission,
  AdminSettingsReadPermission,
  AdminSettingsUpdatePermission,
  AdminNotificationTemplatesReadPermission,
  AdminNotificationTemplatesWritePermission,
  AdminNotificationTemplatesTestPermission,
  AdminNotificationSegmentsReadPermission,
  AdminNotificationSegmentsWritePermission,
  AdminNotificationBroadcastsReadPermission,
  AdminNotificationBroadcastsWritePermission,
  AdminNotificationBroadcastsSendPermission,
  AdminNotificationBroadcastsApprovePermission,
  AdminFeatureFlagsReadPermission,
  AdminFeatureFlagsWritePermission,
  AdminUsersAccessPolicyUpdatePermission,
  AdminUsersReadPermission,
  AdminUsersStatusUpdatePermission,
  AdminUsersWritePermission,
  UserProfileReadPermission,
  type PermissionKey,
} from './permission-catalog';
import type { RoleKey } from './types';

export const UserRole = 'user';
export const AdminRole = 'admin';

export const roleKeys = [UserRole, AdminRole] as const satisfies readonly RoleKey[];

// Default role -> permission grants. `admin` holds the full admin-scoped catalog
// including the break-glass `admin:manage:all` and the DB-backed role management
// grant `admin:roles:write` (RBAC Phase 3).
export const defaultRolePermissions = {
  [UserRole]: [UserProfileReadPermission],
  [AdminRole]: [
    AdminDashboardReadPermission,
    AdminProfileReadPermission,
    AdminUsersReadPermission,
    AdminUsersWritePermission,
    AdminUsersStatusUpdatePermission,
    AdminUsersAccessPolicyUpdatePermission,
    AdminRolesReadPermission,
    AdminRolesWritePermission,
    AdminAuditReadPermission,
    AdminAuthLoginAnalyticsReadPermission,
    AdminSettingsReadPermission,
    AdminSettingsUpdatePermission,
    AdminNotificationTemplatesReadPermission,
    AdminNotificationTemplatesWritePermission,
    AdminNotificationTemplatesTestPermission,
    AdminNotificationSegmentsReadPermission,
    AdminNotificationSegmentsWritePermission,
    AdminNotificationBroadcastsReadPermission,
    AdminNotificationBroadcastsWritePermission,
    AdminNotificationBroadcastsSendPermission,
    AdminNotificationBroadcastsApprovePermission,
    AdminFeatureFlagsReadPermission,
    AdminFeatureFlagsWritePermission,
    AdminManageAllPermission,
  ],
} as const satisfies Record<RoleKey, readonly PermissionKey[]>;

// De-duplicated union of the default grants for the given roles, preserving
// catalog order. Unknown roles contribute nothing (fail closed).
export const permissionsForRoles = (roles: readonly string[]): string[] => [
  ...new Set(roles.flatMap((role) => (role === UserRole || role === AdminRole ? defaultRolePermissions[role] : []))),
];
