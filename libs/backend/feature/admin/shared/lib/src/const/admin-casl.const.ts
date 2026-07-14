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
  AdminManageAction,
] as const;

export const adminResources = [
  'admin.dashboard',
  'admin.profile',
  'admin.users',
  'admin.roles',
  'admin.audit',
  'admin.settings',
] as const;
