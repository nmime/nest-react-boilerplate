/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import type { Locale } from "@app/common/i18n";
import { normalizeStringList } from "@app/common/shared";

export const USER_ROLE = "user";
export const ADMIN_ROLE = "admin";
export const PROFILE_READ_PERMISSION = "profile:read";
export const ADMIN_PROFILE_READ_PERMISSION = "admin:profile:read";
export const ADMIN_DASHBOARD_READ_PERMISSION = "admin:dashboard:read";
export const userThemePreferences = ["system", "light", "dark"] as const;
export type UserThemePreference = (typeof userThemePreferences)[number];

export interface AuthAccessPolicy {
  roles: string[];
  permissions: string[];
}

export interface AuthenticatedUserView {
  id: string;
  email: string;
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
}

export interface AuthSessionView extends JwtTokenPair {
  user: AuthenticatedUserView;
}

export function createDefaultAccessPolicy(
  email: string,
  env: Record<string, string | undefined> = process.env,
): AuthAccessPolicy {
  const adminBootstrapEmails = normalizeStringList(
    env.ADMIN_BOOTSTRAP_EMAILS,
  ).map((item) => item.toLowerCase());
  const normalizedEmail = email.trim().toLowerCase();
  const isAdmin = adminBootstrapEmails.includes(normalizedEmail);

  return {
    roles: isAdmin ? [USER_ROLE, ADMIN_ROLE] : [USER_ROLE],
    permissions: isAdmin
      ? [
          PROFILE_READ_PERMISSION,
          ADMIN_PROFILE_READ_PERMISSION,
          ADMIN_DASHBOARD_READ_PERMISSION,
        ]
      : [PROFILE_READ_PERMISSION],
  };
}

export function toAuthenticatedUserView(input: {
  id: string;
  email: string;
  displayName?: string | null;
  locale?: Locale | null;
  theme?: UserThemePreference | null;
  roles?: string[];
  permissions?: string[];
}): AuthenticatedUserView {
  return {
    id: input.id,
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
export * from "./lib/oauth/language.enum";
