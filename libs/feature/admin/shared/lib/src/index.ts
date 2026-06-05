import type { Locale } from "@app/common/i18n";
import { normalizeStringList } from "@app/common/shared";
import type { AuthenticatedPrincipal } from "@app/feature-auth-shared";

export const ADMIN_ROLE = "admin";
export const USER_ROLE = "user";
export const USER_PROFILE_READ_PERMISSION = "profile:read";

export const ADMIN_PROFILE_READ_PERMISSION = "admin:profile:read";
export const ADMIN_DASHBOARD_READ_PERMISSION = "admin:dashboard:read";
export const ADMIN_USERS_READ_PERMISSION = "admin:users:read";
export const ADMIN_USERS_WRITE_PERMISSION = "admin:users:write";
export const ADMIN_USERS_STATUS_UPDATE_PERMISSION = "admin:users:status:update";
export const ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION =
  "admin:users:access-policy:update";
export const ADMIN_ROLES_READ_PERMISSION = "admin:roles:read";
export const ADMIN_AUDIT_READ_PERMISSION = "admin:audit:read";
export const ADMIN_SETTINGS_READ_PERMISSION = "admin:settings:read";
export const ADMIN_SETTINGS_UPDATE_PERMISSION = "admin:settings:update";

export const adminResources = [
  "admin.dashboard",
  "admin.profile",
  "admin.users",
  "admin.roles",
  "admin.audit",
  "admin.settings",
] as const;

export type AdminResource = (typeof adminResources)[number];

export const adminPermissionCatalog = [
  {
    permission: ADMIN_DASHBOARD_READ_PERMISSION,
    resource: "admin.dashboard",
    action: "read",
    description: "Read admin dashboard metrics and summaries.",
  },
  {
    permission: ADMIN_PROFILE_READ_PERMISSION,
    resource: "admin.profile",
    action: "read",
    description: "Read the current administrator profile.",
  },
  {
    permission: ADMIN_USERS_READ_PERMISSION,
    resource: "admin.users",
    action: "read",
    description: "Search and inspect admin-visible user records.",
  },
  {
    permission: ADMIN_USERS_WRITE_PERMISSION,
    resource: "admin.users",
    action: "write",
    description: "General guarded admin user write capability.",
  },
  {
    permission: ADMIN_USERS_STATUS_UPDATE_PERMISSION,
    resource: "admin.users",
    action: "status:update",
    description: "Enable, disable, or invite admin-visible users.",
  },
  {
    permission: ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
    resource: "admin.users",
    action: "access-policy:update",
    description: "Update user roles and permission assignments.",
  },
  {
    permission: ADMIN_ROLES_READ_PERMISSION,
    resource: "admin.roles",
    action: "read",
    description: "Read the admin RBAC roles and permissions catalog.",
  },
  {
    permission: ADMIN_AUDIT_READ_PERMISSION,
    resource: "admin.audit",
    action: "read",
    description: "Read redacted admin audit events.",
  },
  {
    permission: ADMIN_SETTINGS_READ_PERMISSION,
    resource: "admin.settings",
    action: "read",
    description: "Read admin settings metadata.",
  },
  {
    permission: ADMIN_SETTINGS_UPDATE_PERMISSION,
    resource: "admin.settings",
    action: "update",
    description: "Update guarded admin settings.",
  },
] as const;

export type AdminPermission =
  (typeof adminPermissionCatalog)[number]["permission"];

export const adminRoleCatalog = [
  {
    role: USER_ROLE,
    label: "User",
    description: "Baseline application user role.",
    permissions: [USER_PROFILE_READ_PERMISSION],
  },
  {
    role: ADMIN_ROLE,
    label: "Administrator",
    description: "Back-office administrator with explicit granular grants.",
    permissions: adminPermissionCatalog.map((item) => item.permission),
  },
] as const;

export const adminAssignableRoles = adminRoleCatalog.map((item) => item.role);
export const adminAssignablePermissions = [
  USER_PROFILE_READ_PERMISSION,
  ...adminPermissionCatalog.map((item) => item.permission),
] as const;

export const isAdminAssignableRole = (value: string): boolean =>
  adminAssignableRoles.includes(value as (typeof adminAssignableRoles)[number]);

export const isAdminAssignablePermission = (value: string): boolean =>
  adminAssignablePermissions.includes(
    value as (typeof adminAssignablePermissions)[number],
  );

export interface AdminAccessPolicy {
  isAuthenticated: boolean;
  roles: string[];
  permissions: string[];
  canAccessAdmin: boolean;
  canReadDashboard: boolean;
  canReadProfile: boolean;
  canReadUsers: boolean;
  canUpdateUserStatus: boolean;
  canUpdateUserAccessPolicy: boolean;
  canReadRoles: boolean;
  canReadAudit: boolean;
  canReadSettings: boolean;
  canUpdateSettings: boolean;
}

export interface AdminProfileView {
  id: string;
  email?: string;
  displayName?: string;
  locale?: Locale;
  roles: string[];
  permissions: string[];
}

export interface AdminRbacCatalogView {
  resources: readonly AdminResource[];
  roles: typeof adminRoleCatalog;
  permissions: typeof adminPermissionCatalog;
  assignableRoles: readonly string[];
  assignablePermissions: readonly string[];
}

export const createAdminAccessPolicy = (
  principal?: Partial<AuthenticatedPrincipal>,
): AdminAccessPolicy => {
  const roles = normalizeStringList(principal?.roles);
  const permissions = normalizeStringList(principal?.permissions);
  const hasAdminRole = roles.includes(ADMIN_ROLE);
  const hasPermission = (permission: string): boolean =>
    hasAdminRole && permissions.includes(permission);
  const canReadProfile = hasPermission(ADMIN_PROFILE_READ_PERMISSION);
  const canReadDashboard = hasPermission(ADMIN_DASHBOARD_READ_PERMISSION);
  const canReadUsers = hasPermission(ADMIN_USERS_READ_PERMISSION);
  const canUpdateUserStatus = hasPermission(
    ADMIN_USERS_STATUS_UPDATE_PERMISSION,
  );
  const canUpdateUserAccessPolicy = hasPermission(
    ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
  );
  const canReadRoles = hasPermission(ADMIN_ROLES_READ_PERMISSION);
  const canReadAudit = hasPermission(ADMIN_AUDIT_READ_PERMISSION);
  const canReadSettings = hasPermission(ADMIN_SETTINGS_READ_PERMISSION);
  const canUpdateSettings = hasPermission(ADMIN_SETTINGS_UPDATE_PERMISSION);

  return {
    isAuthenticated: Boolean(principal?.subject),
    roles,
    permissions,
    canAccessAdmin:
      hasAdminRole &&
      (canReadProfile ||
        canReadDashboard ||
        canReadUsers ||
        canReadRoles ||
        canReadAudit ||
        canReadSettings),
    canReadDashboard,
    canReadProfile,
    canReadUsers,
    canUpdateUserStatus,
    canUpdateUserAccessPolicy,
    canReadRoles,
    canReadAudit,
    canReadSettings,
    canUpdateSettings,
  };
};

export const assertAdminProfilePermission = (
  principal: AuthenticatedPrincipal,
): AuthenticatedPrincipal => {
  const policy = createAdminAccessPolicy(principal);
  if (!policy.canReadProfile) {
    throw new Error("Admin profile permission is required.");
  }

  return principal;
};

export const toAdminProfileView = (
  principal: AuthenticatedPrincipal,
): AdminProfileView => {
  assertAdminProfilePermission(principal);
  const policy = createAdminAccessPolicy(principal);

  return {
    id: principal.subject,
    email: principal.email,
    displayName: principal.displayName,
    locale: principal.locale as Locale,
    roles: policy.roles,
    permissions: policy.permissions,
  };
};

export const toAdminRbacCatalogView = (): AdminRbacCatalogView => ({
  resources: adminResources,
  roles: adminRoleCatalog,
  permissions: adminPermissionCatalog,
  assignableRoles: adminAssignableRoles,
  assignablePermissions: adminAssignablePermissions,
});
