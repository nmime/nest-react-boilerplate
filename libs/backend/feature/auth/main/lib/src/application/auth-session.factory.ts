import type { Locale } from '@app/backend-common-i18n';
import {
  type AuthenticatedPrincipal,
  type AuthMethodClaims,
  type AuthSessionView,
  type UserThemePreference,
  AuthProvider,
  AuthProviderChannel,
  type Language,
  isLanguage,
  toAuthenticatedUserView,
} from '@app/backend-feature-auth-shared';

export interface AuthSessionUserRecord {
  id: string;
  tenantId: string;
  email: string | null;
  displayName: string | null;
  passwordHash: string;
  roles: string[];
  permissions: string[];
  locale: Locale | null;
  theme: UserThemePreference;
  status: 'active' | 'disabled' | 'invited';
  lastLoginAt: Date | null;
  avatarUrl?: string | null;
  avatarStatus?: 'none' | 'provider' | 'manual' | 'deleted';
  emailVerifiedAt?: Date | null;
  credentialRevision?: number;
}

export function createAuthSession(
  user: AuthSessionUserRecord,
  claims: AuthMethodClaims = {
    amr: ['pwd'],
    authProvider: AuthProvider.Password,
    authChannel: AuthProviderChannel.Password,
    authTime: Math.floor(Date.now() / 1000),
  },
): AuthSessionView {
  const view = toAuthenticatedUserView(user);
  return {
    user: view,
    emailVerified: Boolean(user.emailVerifiedAt),
    credentialRevision: user.credentialRevision ?? 0,
    ...(claims.amr ? { amr: claims.amr } : {}),
    ...(claims.authProvider ? { authProvider: claims.authProvider } : {}),
    ...(claims.authChannel ? { authChannel: claims.authChannel } : {}),
    ...(claims.authTime ? { authTime: claims.authTime } : {}),
    ...(claims.externalIdentityId ? { externalIdentityId: claims.externalIdentityId } : {}),
  };
}

export function toSessionPrincipal(session: AuthSessionView): AuthenticatedPrincipal {
  return {
    subject: session.user.id,
    tenantId: session.user.tenantId,
    email: session.user.email ?? undefined,
    displayName: session.user.displayName,
    avatarUrl: session.user.avatarUrl ?? undefined,
    locale: normalizeSessionLocale(session.user.locale),
    theme: session.user.theme,
    roles: session.user.roles,
    permissions: session.user.permissions,
    amr: session.amr,
    authProvider: session.authProvider,
    authChannel: session.authChannel,
    authTime: session.authTime,
    externalIdentityId: session.externalIdentityId,
    emailVerified: session.emailVerified,
    credentialRevision: session.credentialRevision,
  };
}

function normalizeSessionLocale(locale: Locale | undefined): Language | undefined {
  return locale && isLanguage(locale) ? locale : undefined;
}
