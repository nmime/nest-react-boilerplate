export const AdminRole = "admin";
export const UserRole = "user";
export const UserProfileReadPermission = "profile:read";

export const AdminProfileReadPermission = "admin:profile:read";
export const AdminDashboardReadPermission = "admin:dashboard:read";
export const AdminUsersReadPermission = "admin:users:read";
export const AdminUsersWritePermission = "admin:users:write";
export const AdminUsersStatusUpdatePermission = "admin:users:status:update";
export const AdminUsersAccessPolicyUpdatePermission =
  "admin:users:access-policy:update";
export const AdminRolesReadPermission = "admin:roles:read";
export const AdminAuditReadPermission = "admin:audit:read";
export const AdminSettingsReadPermission = "admin:settings:read";
export const AdminSettingsUpdatePermission = "admin:settings:update";
export const AdminManageAllPermission = "admin:manage:all";

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
  permissions.includes(AdminManageAllPermission);

export const createAdminAccessPolicy = (
  principal?: AdminPrincipalClaims,
): AdminAccessPolicy => {
  const roles = normalizeStringList(principal?.roles);
  const permissions = normalizeStringList(principal?.permissions);
  const isAdmin = Boolean(principal?.subject && roles.includes(AdminRole));

  const canReadProfile =
    isAdmin && hasPermission(permissions, AdminProfileReadPermission);
  const canReadDashboard =
    isAdmin && hasPermission(permissions, AdminDashboardReadPermission);
  const canReadUsers =
    isAdmin && hasPermission(permissions, AdminUsersReadPermission);
  const canUpdateUserStatus =
    isAdmin && hasPermission(permissions, AdminUsersStatusUpdatePermission);
  const canUpdateUserAccessPolicy =
    isAdmin &&
    hasPermission(permissions, AdminUsersAccessPolicyUpdatePermission);
  const canReadRoles =
    isAdmin && hasPermission(permissions, AdminRolesReadPermission);
  const canReadAudit =
    isAdmin && hasPermission(permissions, AdminAuditReadPermission);
  const canReadSettings =
    isAdmin && hasPermission(permissions, AdminSettingsReadPermission);
  const canUpdateSettings =
    isAdmin && hasPermission(permissions, AdminSettingsUpdatePermission);

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
