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
export const ADMIN_MANAGE_ALL_PERMISSION = "admin:manage:all";

export interface AdminPrincipalClaims {
  subject?: string;
  roles?: readonly string[];
  permissions?: readonly string[];
}

export interface AdminAccessPolicy {
  isAuthenticated: boolean;
  roles: string[];
  permissions: string[];
  canAccessAdmin: boolean;
  canReadProfile: boolean;
  canReadDashboard: boolean;
  canReadUsers: boolean;
  canUpdateUserStatus: boolean;
  canUpdateUserAccessPolicy: boolean;
  canReadRoles: boolean;
  canReadAudit: boolean;
  canReadSettings: boolean;
  canUpdateSettings: boolean;
}

export const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  ];
};

const hasPermission = (
  permissions: readonly string[],
  permission: string,
): boolean =>
  permissions.includes(permission) ||
  permissions.includes(ADMIN_MANAGE_ALL_PERMISSION);

export const createAdminAccessPolicy = (
  principal?: AdminPrincipalClaims,
): AdminAccessPolicy => {
  const roles = normalizeStringList(principal?.roles);
  const permissions = normalizeStringList(principal?.permissions);
  const isAdmin = Boolean(principal?.subject && roles.includes(ADMIN_ROLE));

  const canReadProfile =
    isAdmin && hasPermission(permissions, ADMIN_PROFILE_READ_PERMISSION);
  const canReadDashboard =
    isAdmin && hasPermission(permissions, ADMIN_DASHBOARD_READ_PERMISSION);
  const canReadUsers =
    isAdmin && hasPermission(permissions, ADMIN_USERS_READ_PERMISSION);
  const canUpdateUserStatus =
    isAdmin && hasPermission(permissions, ADMIN_USERS_STATUS_UPDATE_PERMISSION);
  const canUpdateUserAccessPolicy =
    isAdmin &&
    hasPermission(permissions, ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION);
  const canReadRoles =
    isAdmin && hasPermission(permissions, ADMIN_ROLES_READ_PERMISSION);
  const canReadAudit =
    isAdmin && hasPermission(permissions, ADMIN_AUDIT_READ_PERMISSION);
  const canReadSettings =
    isAdmin && hasPermission(permissions, ADMIN_SETTINGS_READ_PERMISSION);
  const canUpdateSettings =
    isAdmin && hasPermission(permissions, ADMIN_SETTINGS_UPDATE_PERMISSION);

  return {
    isAuthenticated: isAdmin,
    roles,
    permissions,
    canAccessAdmin:
      canReadProfile ||
      canReadDashboard ||
      canReadUsers ||
      canUpdateUserStatus ||
      canUpdateUserAccessPolicy ||
      canReadRoles ||
      canReadAudit ||
      canReadSettings ||
      canUpdateSettings,
    canReadProfile,
    canReadDashboard,
    canReadUsers,
    canUpdateUserStatus,
    canUpdateUserAccessPolicy,
    canReadRoles,
    canReadAudit,
    canReadSettings,
    canUpdateSettings,
  };
};

export const assertCanReadAdminProfile = (
  principal?: AdminPrincipalClaims,
): void => {
  const policy = createAdminAccessPolicy(principal);
  if (!policy.canReadProfile) {
    throw new Error("Admin profile permission is required.");
  }
};
