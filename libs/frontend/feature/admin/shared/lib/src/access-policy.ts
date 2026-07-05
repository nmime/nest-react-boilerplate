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
  AdminSettingsReadPermission,
  AdminSettingsUpdatePermission,
  AdminManageAllPermission,
  normalizeStringList,
} from "@app/common-authz";

// Re-export the shared permission and role identifiers plus the claim normalizer
// so importers of @app/frontend-feature-admin-shared keep resolving them here.
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
  AdminSettingsReadPermission,
  AdminSettingsUpdatePermission,
  AdminManageAllPermission,
  normalizeStringList,
};

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
  canWriteRoles: boolean;
  canReadAudit: boolean;
  canReadSettings: boolean;
  canUpdateSettings: boolean;
}

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
  const canWriteRoles =
    isAdmin && hasPermission(permissions, AdminRolesWritePermission);
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
      canWriteRoles ||
      canReadAudit ||
      canReadSettings ||
      canUpdateSettings,
    canReadProfile,
    canReadDashboard,
    canReadUsers,
    canUpdateUserStatus,
    canUpdateUserAccessPolicy,
    canReadRoles,
    canWriteRoles,
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
