import { normalizeStringList } from "@app/common/shared";

export const USER_ROLE = "user";
export const ADMIN_ROLE = "admin";
export const PROFILE_READ_PERMISSION = "profile:read";
export const ADMIN_LEGACY_READ_PERMISSION = "admin:read";
export const ADMIN_PROFILE_READ_PERMISSION = "admin:profile:read";
export const ADMIN_DASHBOARD_READ_PERMISSION = "admin:dashboard:read";

export interface AuthAccessPolicy {
  roles: string[];
  permissions: string[];
}

export interface AuthenticatedUserView {
  id: string;
  email: string;
  displayName?: string;
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
          ADMIN_LEGACY_READ_PERMISSION,
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
  roles?: string[];
  permissions?: string[];
}): AuthenticatedUserView {
  return {
    id: input.id,
    email: input.email,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    roles: normalizeStringList(input.roles),
    permissions: normalizeStringList(input.permissions),
  };
}
