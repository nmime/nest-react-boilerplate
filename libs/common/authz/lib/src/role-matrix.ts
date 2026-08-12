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

export const baseRoleKeys = [UserRole, AdminRole] as const satisfies readonly RoleKey[];

// Boilerplate-owned role -> permission grants. `admin` holds the full admin-scoped catalog
// including the break-glass `admin:manage:all` and the DB-backed role management
// grant `admin:roles:write` (RBAC Phase 3). Products extend these — and add roles of their
// own — through `productAuthzExtensions`; read ./effective-catalog for the composed matrix.
export const baseRolePermissions = {
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

/**
 * The composed matrix always carries the two base roles, so those stay precisely typed; any
 * further role a product registers is reachable through the index signature.
 */
export type RolePermissionMatrix = { readonly [Role in RoleKey]: readonly string[] } & {
  readonly [role: string]: readonly string[];
};
