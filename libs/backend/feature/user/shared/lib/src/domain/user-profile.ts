import { normalizeStringList } from "./util";

export interface UserProfilePrincipal {
  subject: string;
  email?: string;
  displayName?: string;
  locale?: string;
  roles: readonly string[];
  permissions: readonly string[];
}

export interface UserProfile {
  id: string;
  email?: string;
  displayName?: string;
  locale?: string;
  roles: string[];
  permissions: string[];
}

export function createUserProfile(
  principal: UserProfilePrincipal,
): UserProfile {
  return {
    id: principal.subject,
    email: principal.email,
    displayName: principal.displayName,
    locale: principal.locale,
    roles: normalizeStringList(principal.roles),
    permissions: normalizeStringList(principal.permissions),
  };
}
