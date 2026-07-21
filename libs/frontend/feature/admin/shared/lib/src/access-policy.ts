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
  AdminManageAllPermission,
  normalizeStringList,
} from '@app/common-authz';

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
  canReadAuthLoginAnalytics: boolean;
  canReadSettings: boolean;
  canUpdateSettings: boolean;
  canReadNotificationTemplates: boolean;
  canWriteNotificationTemplates: boolean;
  canTestNotificationTemplates: boolean;
  canReadNotificationSegments: boolean;
  canWriteNotificationSegments: boolean;
  canReadNotificationBroadcasts: boolean;
  canWriteNotificationBroadcasts: boolean;
  canSendNotificationBroadcasts: boolean;
  canApproveNotificationBroadcasts: boolean;
}

const hasPermission = (permissions: readonly string[], permission: string): boolean =>
  permissions.includes(permission) || permissions.includes(AdminManageAllPermission);

export const createAdminAccessPolicy = (principal?: AdminPrincipalClaims): AdminAccessPolicy => {
  const roles = normalizeStringList(principal?.roles);
  const permissions = normalizeStringList(principal?.permissions);
  const isAdmin = Boolean(principal?.subject && roles.includes(AdminRole));
  const capability = (permission: string): boolean => isAdmin && hasPermission(permissions, permission);
  const capabilities = {
    canReadProfile: capability(AdminProfileReadPermission),
    canReadDashboard: capability(AdminDashboardReadPermission),
    canReadUsers: capability(AdminUsersReadPermission),
    canUpdateUserStatus: capability(AdminUsersStatusUpdatePermission),
    canUpdateUserAccessPolicy: capability(AdminUsersAccessPolicyUpdatePermission),
    canReadRoles: capability(AdminRolesReadPermission),
    canWriteRoles: capability(AdminRolesWritePermission),
    canReadAudit: capability(AdminAuditReadPermission),
    canReadAuthLoginAnalytics: capability(AdminAuthLoginAnalyticsReadPermission),
    canReadSettings: capability(AdminSettingsReadPermission),
    canUpdateSettings: capability(AdminSettingsUpdatePermission),
    canReadNotificationTemplates: capability(AdminNotificationTemplatesReadPermission),
    canWriteNotificationTemplates: capability(AdminNotificationTemplatesWritePermission),
    canTestNotificationTemplates: capability(AdminNotificationTemplatesTestPermission),
    canReadNotificationSegments: capability(AdminNotificationSegmentsReadPermission),
    canWriteNotificationSegments: capability(AdminNotificationSegmentsWritePermission),
    canReadNotificationBroadcasts: capability(AdminNotificationBroadcastsReadPermission),
    canWriteNotificationBroadcasts: capability(AdminNotificationBroadcastsWritePermission),
    canSendNotificationBroadcasts: capability(AdminNotificationBroadcastsSendPermission),
    canApproveNotificationBroadcasts: capability(AdminNotificationBroadcastsApprovePermission),
  };

  return {
    isAuthenticated: isAdmin,
    roles,
    permissions,
    canAccessAdmin: Object.values(capabilities).some(Boolean),
    ...capabilities,
  };
};

export const assertCanReadAdminProfile = (principal?: AdminPrincipalClaims): void => {
  const policy = createAdminAccessPolicy(principal);
  if (!policy.canReadProfile) {
    throw new Error('Admin profile permission is required.');
  }
};
