import type { Locale } from "@app/common/i18n";
import { normalizeStringList } from "@app/common/shared";
import type { AuthenticatedPrincipal } from "@app/feature-auth-oauth";

export const ADMIN_ROLE = "admin";
export const ADMIN_PROFILE_READ_PERMISSION = "admin:profile:read";
export const ADMIN_DASHBOARD_READ_PERMISSION = "admin:dashboard:read";

export type AdminPermission =
  | typeof ADMIN_PROFILE_READ_PERMISSION
  | typeof ADMIN_DASHBOARD_READ_PERMISSION;

export interface AdminAccessPolicy {
  isAuthenticated: boolean;
  roles: string[];
  permissions: string[];
  canAccessAdmin: boolean;
  canReadDashboard: boolean;
  canReadProfile: boolean;
}

export interface AdminProfileView {
  id: string;
  email?: string;
  displayName?: string;
  locale?: Locale;
  roles: string[];
  permissions: string[];
}

export const createAdminAccessPolicy = (
  principal?: Partial<AuthenticatedPrincipal>,
): AdminAccessPolicy => {
  const roles = normalizeStringList(principal?.roles);
  const permissions = normalizeStringList(principal?.permissions);
  const hasAdminRole = roles.includes(ADMIN_ROLE);
  const canReadProfile =
    hasAdminRole && permissions.includes(ADMIN_PROFILE_READ_PERMISSION);
  const canReadDashboard =
    hasAdminRole && permissions.includes(ADMIN_DASHBOARD_READ_PERMISSION);

  return {
    isAuthenticated: Boolean(principal?.subject),
    roles,
    permissions,
    canAccessAdmin: hasAdminRole && (canReadProfile || canReadDashboard),
    canReadDashboard,
    canReadProfile,
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
    locale: principal.locale,
    roles: policy.roles,
    permissions: policy.permissions,
  };
};
