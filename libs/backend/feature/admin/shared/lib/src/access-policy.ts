import type { Locale } from '@app/backend-common-i18n';
import { canAdmin, createAdminAbility } from './ability';
import { normalizeStringList } from './normalize';
import {
  AdminAllResource,
  AdminManageAction,
  adminAssignablePermissions,
  adminAssignableRoles,
  adminPermissionCatalog,
  adminResources,
  adminRoleCatalog,
  type AdminPrincipalClaims,
  type AdminResource,
} from './permissions';

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
  avatarUrl?: string;
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

export const createAdminAccessPolicy = (principal?: AdminPrincipalClaims): AdminAccessPolicy => {
  const roles = normalizeStringList(principal?.roles);
  const permissions = normalizeStringList(principal?.permissions);
  const ability = createAdminAbility(principal);
  const canReadProfile = canAdmin(ability, 'read', 'admin.profile');
  const canReadDashboard = canAdmin(ability, 'read', 'admin.dashboard');
  const canReadUsers = canAdmin(ability, 'read', 'admin.users');
  const canUpdateUserStatus = canAdmin(ability, 'status:update', 'admin.users');
  const canUpdateUserAccessPolicy = canAdmin(ability, 'access-policy:update', 'admin.users');
  const canReadRoles = canAdmin(ability, 'read', 'admin.roles');
  const canReadAudit = canAdmin(ability, 'read', 'admin.audit');
  const canReadSettings = canAdmin(ability, 'read', 'admin.settings');
  const canUpdateSettings = canAdmin(ability, 'update', 'admin.settings');

  return {
    isAuthenticated: Boolean(principal?.subject),
    roles,
    permissions,
    canAccessAdmin:
      canReadProfile ||
      canReadDashboard ||
      canReadUsers ||
      canReadRoles ||
      canReadAudit ||
      canReadSettings ||
      canAdmin(ability, AdminManageAction, AdminAllResource),
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

export const assertAdminProfilePermission = <T extends AdminPrincipalClaims>(principal: T): T => {
  const policy = createAdminAccessPolicy(principal);
  if (!policy.canReadProfile) {
    throw new Error('Admin profile permission is required.');
  }

  return principal;
};

export const toAdminProfileView = <
  T extends AdminPrincipalClaims & {
    email?: string;
    displayName?: string;
    avatarUrl?: string;
    locale?: unknown;
  },
>(
  principal: T,
): AdminProfileView => {
  assertAdminProfilePermission(principal);
  const policy = createAdminAccessPolicy(principal);

  return {
    // assertAdminProfilePermission above guarantees a subject: the profile
    // ability is only granted to principals with a subject (see
    // createAdminAbility), so no nullish fallback branch is reachable here.
    id: principal.subject as string,
    email: principal.email,
    displayName: principal.displayName,
    avatarUrl: principal.avatarUrl,
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
