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
  baseRolePermissions,
  defaultRolePermissions,
  permissionCatalog,
  roleKeys,
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

// The admin-scoped catalog is the whole composed catalog minus the user-scoped grants of the base
// `user` role, sourced from the shared definitions so resource/action metadata never drifts. It is
// deliberately not keyed on what the `admin` role happens to hold: a permission a product registers
// through `productAuthzExtensions` and grants to a role of its own must still be assignable and
// CASL-mappable here, or the guard would refuse a principal that legitimately holds it.
const userScopedPermissionKeys = new Set<string>(baseRolePermissions[UserRole]);

export const adminPermissionCatalog = permissionCatalog
  .filter((entry) => !userScopedPermissionKeys.has(entry.key))
  .map((entry) => ({
    permission: entry.key,
    // Resource and action are cast for CASL's benefit: the shared catalog is open to product
    // permissions, whose resource/action pairs are outside the boilerplate's own unions. CASL
    // compares them as plain strings at runtime, so an unlisted pair authorizes correctly.
    resource: entry.resource as AdminSubject,
    action: entry.action as AdminAction,
    description: entry.description,
  }));

export type AdminPermission = Exclude<PermissionKey, typeof UserProfileReadPermission>;

const adminPermissionByName: ReadonlyMap<string, (typeof adminPermissionCatalog)[number]> = new Map(
  adminPermissionCatalog.map((item) => [item.permission, item]),
);

export const adminRolePermissionMatrix = defaultRolePermissions;

// Only the boilerplate's own roles carry human-facing copy. A role composed in through
// `productAuthzExtensions` has none, so its key stands in and the RBAC UI still lists it.
const adminRoleDescriptions: Readonly<Record<string, { label: string; description: string }>> = {
  [UserRole]: { label: 'User', description: 'Baseline application user role.' },
  [AdminRole]: {
    label: 'Administrator',
    description: 'Back-office administrator with explicit granular grants.',
  },
};

export const adminRoleCatalog = roleKeys.map((role) => ({
  role,
  label: adminRoleDescriptions[role]?.label ?? role,
  description: adminRoleDescriptions[role]?.description ?? role,
  permissions: [...(adminRolePermissionMatrix[role] ?? [])],
}));

export const adminAssignableRoles: readonly string[] = adminRoleCatalog.map((item) => item.role);

// Everything an administrator may hand out, including the user-scoped grants the admin surface
// itself never gates on, in catalog order.
export const adminAssignablePermissions: readonly string[] = permissionCatalog.map((entry) => entry.key);

export const isAdminAssignableRole = (value: string): boolean => adminAssignableRoles.includes(value);

export const isAdminAssignablePermission = (value: string): boolean => adminAssignablePermissions.includes(value);

export const isKnownAdminPermission = (value: string): value is AdminPermission => adminPermissionByName.has(value);

export const adminPermissionToAbility = (
  permission: string,
): { action: AdminAction; resource: AdminSubject } | undefined => {
  const item = adminPermissionByName.get(permission);

  return item ? { action: item.action, resource: item.resource } : undefined;
};
