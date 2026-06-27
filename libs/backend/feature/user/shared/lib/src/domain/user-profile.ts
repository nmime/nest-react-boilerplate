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

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value
        .filter((item): item is string => isNonEmptyString(item))
        .map((item) => item.trim()),
    );
  }

  if (typeof value === "string") {
    return uniqueStrings(
      value
        .split(/[\s,]+/u)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    );
  }

  return [];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
