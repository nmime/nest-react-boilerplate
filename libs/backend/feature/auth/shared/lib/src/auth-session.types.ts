import type { Locale } from "@app/common-i18n";
import { normalizeStringList } from "@app/backend-common-shared";
import {
  resolveTenantId,
  AuthenticatedTheme,
  isAuthenticatedTheme,
  type UserThemePreference,
  type AuthProvider,
  type AuthProviderChannel,
} from "./oauth";

export interface AuthenticatedUserView {
  id: string;
  tenantId: string;
  email: string | null;
  displayName?: string;
  locale?: Locale;
  theme: UserThemePreference;
  roles: string[];
  permissions: string[];
  avatarUrl?: string | null;
  avatarStatus?: "none" | "provider" | "manual" | "deleted";
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

export function toAuthenticatedUserView(input: {
  id: string;
  tenantId?: string | null;
  email: string | null;
  displayName?: string | null;
  locale?: Locale | null;
  theme?: string | null;
  roles?: string[];
  permissions?: string[];
  avatarUrl?: string | null;
  avatarStatus?: "none" | "provider" | "manual" | "deleted";
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
    ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    ...(input.avatarStatus && input.avatarStatus !== "none"
      ? { avatarStatus: input.avatarStatus }
      : {}),
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
