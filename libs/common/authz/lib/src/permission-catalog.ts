import type { AbilityTarget, PermissionDefinition } from './types';

export const UserProfileReadPermission = 'profile:read';
export const AdminProfileReadPermission = 'admin:profile:read';
export const AdminDashboardReadPermission = 'admin:dashboard:read';
export const AdminUsersReadPermission = 'admin:users:read';
export const AdminUsersWritePermission = 'admin:users:write';
export const AdminUsersStatusUpdatePermission = 'admin:users:status:update';
export const AdminUsersAccessPolicyUpdatePermission = 'admin:users:access-policy:update';
export const AdminRolesReadPermission = 'admin:roles:read';
export const AdminRolesWritePermission = 'admin:roles:write';
export const AdminAuditReadPermission = 'admin:audit:read';
export const AdminAuthLoginAnalyticsReadPermission = 'admin:auth-login-analytics:read';
export const AdminSettingsReadPermission = 'admin:settings:read';
export const AdminSettingsUpdatePermission = 'admin:settings:update';
export const AdminNotificationTemplatesReadPermission = 'admin:notification-templates:read';
export const AdminNotificationTemplatesWritePermission = 'admin:notification-templates:write';
export const AdminNotificationTemplatesTestPermission = 'admin:notification-templates:test';
export const AdminNotificationSegmentsReadPermission = 'admin:notification-segments:read';
export const AdminNotificationSegmentsWritePermission = 'admin:notification-segments:write';
export const AdminNotificationBroadcastsReadPermission = 'admin:notification-broadcasts:read';
export const AdminNotificationBroadcastsWritePermission = 'admin:notification-broadcasts:write';
export const AdminNotificationBroadcastsSendPermission = 'admin:notification-broadcasts:send';
export const AdminNotificationBroadcastsApprovePermission = 'admin:notification-broadcasts:approve';
export const AdminManageAllPermission = 'admin:manage:all';

// Single source of truth for every RBAC permission. Resource/action pairs are
// framework-neutral data; the backend admin lib maps them onto CASL subjects
// and actions, while the frontend consumes the same data without CASL.
export const permissionCatalog = [
  {
    key: UserProfileReadPermission,
    resource: 'profile',
    action: 'read',
    description: "Read the signed-in user's own profile.",
  },
  {
    key: AdminDashboardReadPermission,
    resource: 'admin.dashboard',
    action: 'read',
    description: 'Read admin dashboard metrics and summaries.',
  },
  {
    key: AdminProfileReadPermission,
    resource: 'admin.profile',
    action: 'read',
    description: 'Read the current administrator profile.',
  },
  {
    key: AdminUsersReadPermission,
    resource: 'admin.users',
    action: 'read',
    description: 'Search and inspect admin-visible user records.',
  },
  {
    key: AdminUsersWritePermission,
    resource: 'admin.users',
    action: 'write',
    description: 'General guarded admin user write capability.',
  },
  {
    key: AdminUsersStatusUpdatePermission,
    resource: 'admin.users',
    action: 'status:update',
    description: 'Enable, disable, or invite admin-visible users.',
  },
  {
    key: AdminUsersAccessPolicyUpdatePermission,
    resource: 'admin.users',
    action: 'access-policy:update',
    description: 'Update user roles and permission assignments.',
  },
  {
    key: AdminRolesReadPermission,
    resource: 'admin.roles',
    action: 'read',
    description: 'Read the admin RBAC roles and permissions catalog.',
  },
  {
    key: AdminRolesWritePermission,
    resource: 'admin.roles',
    action: 'write',
    description: 'Create and update admin RBAC roles and their grants.',
  },
  {
    key: AdminAuditReadPermission,
    resource: 'admin.audit',
    action: 'read',
    description: 'Read redacted admin audit events.',
  },
  {
    key: AdminAuthLoginAnalyticsReadPermission,
    resource: 'admin.auth-login-analytics',
    action: 'read',
    description: 'Read tenant-scoped authentication login, GeoIP, language, and timezone analytics.',
  },
  {
    key: AdminSettingsReadPermission,
    resource: 'admin.settings',
    action: 'read',
    description: 'Read admin settings metadata.',
  },
  {
    key: AdminSettingsUpdatePermission,
    resource: 'admin.settings',
    action: 'update',
    description: 'Update guarded admin settings.',
  },
  {
    key: AdminNotificationTemplatesReadPermission,
    resource: 'admin.notification-templates',
    action: 'read',
    description: 'Read notification templates and immutable versions.',
  },
  {
    key: AdminNotificationTemplatesWritePermission,
    resource: 'admin.notification-templates',
    action: 'write',
    description: 'Create, edit, publish, and archive admin-owned notification templates.',
  },
  {
    key: AdminNotificationTemplatesTestPermission,
    resource: 'admin.notification-templates',
    action: 'test',
    description: 'Queue auditable test deliveries from notification templates.',
  },
  {
    key: AdminNotificationSegmentsReadPermission,
    resource: 'admin.notification-segments',
    action: 'read',
    description: 'Read notification audience segments and resolver metadata.',
  },
  {
    key: AdminNotificationSegmentsWritePermission,
    resource: 'admin.notification-segments',
    action: 'write',
    description: 'Create, update, archive, estimate, and upload notification segments.',
  },
  {
    key: AdminNotificationBroadcastsReadPermission,
    resource: 'admin.notification-broadcasts',
    action: 'read',
    description: 'Read broadcast configuration, state, audience, and delivery statistics.',
  },
  {
    key: AdminNotificationBroadcastsWritePermission,
    resource: 'admin.notification-broadcasts',
    action: 'write',
    description: 'Create and update notification broadcast drafts and collect audiences.',
  },
  {
    key: AdminNotificationBroadcastsSendPermission,
    resource: 'admin.notification-broadcasts',
    action: 'send',
    description: 'Send, schedule, pause, resume, and cancel notification broadcasts.',
  },
  {
    key: AdminNotificationBroadcastsApprovePermission,
    resource: 'admin.notification-broadcasts',
    action: 'approve',
    description: 'Independently approve notification broadcasts.',
  },
  {
    key: AdminManageAllPermission,
    resource: 'all',
    action: 'manage',
    description: 'Explicit break-glass permission to manage every admin resource.',
  },
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof permissionCatalog)[number]['key'];

const permissionByKey: ReadonlyMap<string, (typeof permissionCatalog)[number]> = new Map(
  permissionCatalog.map((entry) => [entry.key, entry]),
);

export const isKnownPermission = (value: string): value is PermissionKey => permissionByKey.has(value);

export const permissionToAbilityTarget = (permission: string): AbilityTarget | undefined => {
  const entry = permissionByKey.get(permission);

  return entry ? { action: entry.action, resource: entry.resource } : undefined;
};
