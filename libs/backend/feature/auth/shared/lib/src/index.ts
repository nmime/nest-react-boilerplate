import type { Locale } from "@app/common/i18n";
import { normalizeStringList } from "@app/backend/common/shared";
import {
  DEFAULT_AUTH_TENANT_ID,
  resolveTenantId,
} from "./lib/oauth/tenant-context";
import type {
  AuthProvider,
  AuthProviderChannel,
} from "./lib/oauth/social-auth.types";

export const USER_ROLE = "user";
export const ADMIN_ROLE = "admin";
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
export const userThemePreferences = ["system", "light", "dark"] as const;
export type UserThemePreference = (typeof userThemePreferences)[number];

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
  tenantId = DEFAULT_AUTH_TENANT_ID,
): AuthAccessPolicy {
  const normalizedEmail = email.trim().toLowerCase();
  const isAdmin = isAdminBootstrapAllowed(normalizedEmail, tenantId, env);

  return {
    roles: isAdmin ? [USER_ROLE, ADMIN_ROLE] : [USER_ROLE],
    permissions: isAdmin
      ? [
          USER_PROFILE_READ_PERMISSION,
          ADMIN_PROFILE_READ_PERMISSION,
          ADMIN_DASHBOARD_READ_PERMISSION,
          ADMIN_USERS_READ_PERMISSION,
          ADMIN_USERS_WRITE_PERMISSION,
          ADMIN_USERS_STATUS_UPDATE_PERMISSION,
          ADMIN_USERS_ACCESS_POLICY_UPDATE_PERMISSION,
          ADMIN_ROLES_READ_PERMISSION,
          ADMIN_AUDIT_READ_PERMISSION,
          ADMIN_SETTINGS_READ_PERMISSION,
          ADMIN_SETTINGS_UPDATE_PERMISSION,
        ]
      : [USER_PROFILE_READ_PERMISSION],
  };
}

export function isAdminBootstrapAllowed(
  normalizedEmail: string,
  tenantId = DEFAULT_AUTH_TENANT_ID,
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
    tenantId === DEFAULT_AUTH_TENANT_ID || allowedTenantIds.includes(tenantId)
  );
}

export function toAuthenticatedUserView(input: {
  id: string;
  tenantId?: string | null;
  email: string | null;
  displayName?: string | null;
  locale?: Locale | null;
  theme?: UserThemePreference | null;
  roles?: string[];
  permissions?: string[];
}): AuthenticatedUserView {
  return {
    id: input.id,
    tenantId: resolveTenantId(input.tenantId),
    email: input.email,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.locale ? { locale: input.locale } : {}),
    theme: normalizeUserThemePreference(input.theme) ?? "system",
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
  return userThemePreferences.find((theme) => theme === normalized);
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
