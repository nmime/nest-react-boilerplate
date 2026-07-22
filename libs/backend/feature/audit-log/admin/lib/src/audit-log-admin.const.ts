export const AdminAuditResources = [
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

export type AdminAuditResource = (typeof AdminAuditResources)[number];

export const AuditLogAdminDefaultPageSize = 50;
export const AuditLogAdminMaxPageSize = 100;
