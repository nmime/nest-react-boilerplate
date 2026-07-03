import type { Locale } from "@app/common-i18n";
import { normalizeStringList } from "@app/backend-common-shared";
import {
  DefaultAuthTenantId,
  resolveTenantId,
} from "./lib/oauth/tenant-context";
import {
  AuthenticatedTheme,
  isAuthenticatedTheme,
  type UserThemePreference,
} from "./lib/oauth/access-control.types";
import type {
  AuthProvider,
  AuthProviderChannel,
} from "./lib/oauth/social-auth.types";

export const UserRole = "user";
export const AdminRole = "admin";
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

export interface AuthAccessPolicy {
  roles: string[];
  permissions: string[];
}

export interface AuthenticatedUserView {
  id: string;
  tenantId: string;
  email: string | null;
  displayName?: string;
  locale?: Locale;
  theme: UserThemePreference;
  roles: string[];
  permissions: string[];
}

export interface JwtTokenPair {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  refreshToken?: string;
}

export interface AuthSessionView extends JwtTokenPair {
  user: AuthenticatedUserView;
  amr?: string[];
  authProvider?: AuthProvider;
  authChannel?: AuthProviderChannel;
  authTime?: number;
  externalIdentityId?: string;
}

export function createDefaultAccessPolicy(
  email: string,
  env: Record<string, string | undefined> = process.env,
  tenantId = DefaultAuthTenantId,
): AuthAccessPolicy {
  const normalizedEmail = email.trim().toLowerCase();
  const isAdmin = isAdminBootstrapAllowed(normalizedEmail, tenantId, env);

  return {
    roles: isAdmin ? [UserRole, AdminRole] : [UserRole],
    permissions: isAdmin
      ? [
          UserProfileReadPermission,
          AdminProfileReadPermission,
          AdminDashboardReadPermission,
          AdminUsersReadPermission,
          AdminUsersWritePermission,
          AdminUsersStatusUpdatePermission,
          AdminUsersAccessPolicyUpdatePermission,
          AdminRolesReadPermission,
          AdminAuditReadPermission,
          AdminSettingsReadPermission,
          AdminSettingsUpdatePermission,
        ]
      : [UserProfileReadPermission],
  };
}

export function isAdminBootstrapAllowed(
  normalizedEmail: string,
  tenantId = DefaultAuthTenantId,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.ADMIN_BOOTSTRAP_ENABLED !== "true") {
    return false;
  }

  const adminBootstrapEmails = normalizeStringList(
    env.ADMIN_BOOTSTRAP_EMAILS,
  ).map((item) => item.toLowerCase());
  if (!adminBootstrapEmails.includes(normalizedEmail)) {
    return false;
  }

  const allowedTenantIds = normalizeStringList(env.ADMIN_BOOTSTRAP_TENANT_IDS);
  return (
    tenantId === DefaultAuthTenantId || allowedTenantIds.includes(tenantId)
  );
}

export function toAuthenticatedUserView(input: {
  id: string;
  tenantId?: string | null;
  email: string | null;
  displayName?: string | null;
  locale?: Locale | null;
  theme?: string | null;
  roles?: string[];
  permissions?: string[];
}): AuthenticatedUserView {
  return {
    id: input.id,
    tenantId: resolveTenantId(input.tenantId),
    email: input.email,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.locale ? { locale: input.locale } : {}),
    theme:
      normalizeUserThemePreference(input.theme) ?? AuthenticatedTheme.System,
    roles: normalizeStringList(input.roles),
    permissions: normalizeStringList(input.permissions),
  };
}

export function normalizeUserThemePreference(
  value: string | null | undefined,
): UserThemePreference | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return isAuthenticatedTheme(normalized) ? normalized : undefined;
}
export * from "./lib/oauth/access-control.decorators";
export * from "./lib/oauth/access-control.types";
export * from "./lib/oauth/auth-oauth.module";
export * from "./lib/oauth/auth-oauth.service";
export * from "./lib/oauth/auth-oauth.types";
export * from "./lib/oauth/bearer-auth.guard";
export * from "./lib/oauth/rbac.guard";
export * from "./lib/oauth/session-auth.guard";
export * from "./lib/oauth/social-auth.types";
export * from "./lib/oauth/tenant-context";
export * from "./lib/oauth/tenant-lifecycle";
export * from "./lib/oauth/language.enum";
