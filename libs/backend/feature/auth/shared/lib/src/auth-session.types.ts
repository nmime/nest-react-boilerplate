import type { Locale } from '@app/backend-common-i18n';
import { normalizeStringList } from './util';
import {
  resolveTenantId,
  AuthenticatedTheme,
  isAuthenticatedTheme,
  type AuthenticatedPrincipal,
  type UserThemePreference,
  type AuthProvider,
  type AuthProviderChannel,
} from './oauth';

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
  avatarStatus?: 'none' | 'provider' | 'manual' | 'deleted';
}

export interface AuthSessionView {
  user: AuthenticatedUserView;
  amr?: string[];
  authProvider?: AuthProvider;
  authChannel?: AuthProviderChannel;
  authTime?: number;
  externalIdentityId?: string;
  emailVerified?: boolean;
  /**
   * The account's credential epoch at the moment this session was minted. Access guards compare
   * it against the stored account so a later password change invalidates this session.
   */
  credentialRevision?: number;
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
  avatarStatus?: 'none' | 'provider' | 'manual' | 'deleted';
}): AuthenticatedUserView {
  return {
    id: input.id,
    tenantId: resolveTenantId(input.tenantId),
    email: input.email,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.locale ? { locale: input.locale } : {}),
    theme: normalizeUserThemePreference(input.theme) ?? AuthenticatedTheme.System,
    roles: normalizeStringList(input.roles),
    permissions: normalizeStringList(input.permissions),
    ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    ...(input.avatarStatus && input.avatarStatus !== 'none' ? { avatarStatus: input.avatarStatus } : {}),
  };
}

/**
 * The account view of a principal that has no account row behind it — today, the demo
 * principal. Everything the app shell renders already lives on the principal, so this is a
 * projection of it rather than a second source of truth about the user.
 */
export function principalUserView(principal: AuthenticatedPrincipal): AuthenticatedUserView {
  return toAuthenticatedUserView({
    id: principal.subject,
    tenantId: principal.tenantId,
    email: principal.email ?? null,
    displayName: principal.displayName,
    locale: principal.locale,
    theme: principal.theme,
    roles: principal.roles,
    permissions: principal.permissions,
    avatarUrl: principal.avatarUrl,
  });
}

export function normalizeUserThemePreference(value: string | null | undefined): UserThemePreference | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return isAuthenticatedTheme(normalized) ? normalized : undefined;
}
