import type { Locale } from "@app/common/i18n";
import { normalizeStringList } from "@app/common/shared";
import type { AuthenticatedPrincipal } from "@app/feature-auth-oauth";

export const USER_PROFILE_READ_PERMISSION = "profile:read";

export interface UserProfileView {
  id: string;
  email?: string;
  displayName?: string;
  locale?: Locale;
  roles: string[];
  permissions: string[];
}

export function toUserProfileView(
  principal: AuthenticatedPrincipal,
): UserProfileView {
  return {
    id: principal.subject,
    email: principal.email,
    displayName: principal.displayName,
    locale: principal.locale,
    roles: normalizeStringList(principal.roles),
    permissions: normalizeStringList(principal.permissions),
  };
}
