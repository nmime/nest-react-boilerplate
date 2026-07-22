import {
  AdminRole,
  UserRole,
  UserProfileReadPermission,
  AdminProfileReadPermission,
  AdminDashboardReadPermission,
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
  defaultRolePermissions,
  permissionCatalog,
  type PermissionKey,
} from '@app/common-authz';

// Re-export the shared permission and role identifiers so importers of
// @app/backend-feature-admin-shared keep resolving them from this module.
export {
  AdminRole,
  UserRole,
  UserProfileReadPermission,
  AdminProfileReadPermission,
  AdminDashboardReadPermission,
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
};

// CASL-specific vocabulary stays in the backend admin lib; the shared catalog is
// framework-neutral, so the CASL subject/action universe is declared here.
export const AdminManageAction = 'manage';
export const AdminAllResource = 'all';

export const adminActions = [
  'read',
  'write',
  'status:update',
  'access-policy:update',
  'update',
  'test',
  'send',
  'approve',
  AdminManageAction,
] as const;

export const adminResources = [
  'admin.dashboard',
  'admin.profile',
  'admin.users',
  'admin.roles',
  'admin.audit',
  'admin.auth-login-analytics',
  'admin.settings',
  'admin.notification-templates',
  'admin.notification-segments',
  'admin.notification-broadcasts',
  'admin.feature-flags',
] as const;

export type AdminAction = (typeof adminActions)[number];
export type AdminResource = (typeof adminResources)[number];
export type AdminSubject = AdminResource | typeof AdminAllResource;

export interface AdminPrincipalClaims {
  subject?: string;
  roles?: readonly string[];
  permissions?: readonly string[];
}

// The admin-scoped catalog is the subset of the shared catalog granted to the
// admin role (everything except the user-scoped `profile:read`), sourced from
// the shared definitions so resource/action metadata never drifts.
const adminPermissionKeys = new Set<string>(defaultRolePermissions[AdminRole]);

export const adminPermissionCatalog = permissionCatalog
  .filter((entry) => adminPermissionKeys.has(entry.key))
  .map((entry) => ({
    permission: entry.key,
    resource: entry.resource as AdminSubject,
    action: entry.action,
    description: entry.description,
  }));

export type AdminPermission = Exclude<PermissionKey, typeof UserProfileReadPermission>;

const adminPermissionByName: ReadonlyMap<string, (typeof adminPermissionCatalog)[number]> = new Map(
  adminPermissionCatalog.map((item) => [item.permission, item]),
);

export const adminRolePermissionMatrix = defaultRolePermissions;

export const adminRoleCatalog = [
  {
    role: UserRole,
    label: 'User',
    description: 'Baseline application user role.',
    permissions: [...adminRolePermissionMatrix[UserRole]],
  },
  {
    role: AdminRole,
    label: 'Administrator',
    description: 'Back-office administrator with explicit granular grants.',
    permissions: [...adminRolePermissionMatrix[AdminRole]],
  },
] as const;

export const adminAssignableRoles = adminRoleCatalog.map((item) => item.role);
export const adminAssignablePermissions = [
  UserProfileReadPermission,
  ...adminPermissionCatalog.map((item) => item.permission),
] as const;

export const isAdminAssignableRole = (value: string): boolean =>
  adminAssignableRoles.includes(value as (typeof adminAssignableRoles)[number]);

export const isAdminAssignablePermission = (value: string): boolean =>
  adminAssignablePermissions.includes(value as (typeof adminAssignablePermissions)[number]);

export const isKnownAdminPermission = (value: string): value is AdminPermission => adminPermissionByName.has(value);

export const adminPermissionToAbility = (
  permission: string,
): { action: AdminAction; resource: AdminSubject } | undefined => {
  const item = adminPermissionByName.get(permission);

  return item ? { action: item.action, resource: item.resource } : undefined;
};
