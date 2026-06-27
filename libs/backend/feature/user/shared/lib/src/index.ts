import type { Locale } from "@app/common/i18n";
import { normalizeStringList } from "@app/backend/common/shared";
import {
  type AuthenticatedPrincipal,
  USER_PROFILE_READ_PERMISSION,
} from "@app/backend/feature/auth/shared";

export { USER_PROFILE_READ_PERMISSION };

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
    locale: principal.locale as Locale,
    roles: normalizeStringList(principal.roles),
    permissions: normalizeStringList(principal.permissions),
  };
}
