import { normalizeStringList } from "@app/common/shared";
import type { AuthenticatedPrincipal } from "@app/features-auth-oauth";

export const USER_PROFILE_READ_PERMISSION = "profile:read";

export interface UserProfileView {
  id: string;
  email?: string;
  displayName?: string;
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
    roles: normalizeStringList(principal.roles),
    permissions: normalizeStringList(principal.permissions),
  };
}
