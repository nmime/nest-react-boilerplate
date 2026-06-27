import type { Locale } from "@app/common/i18n";
import {
  type AuthenticatedPrincipal,
  type AuthMethodClaims,
  type AuthSessionView,
  type UserThemePreference,
  Language,
  toAuthenticatedUserView,
} from "@app/backend/feature/auth/shared";
import {
  readExpiresInSeconds,
  signJwt,
  type JwtSigningEnvironment,
} from "../domain/jwt-signer";

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
  status: "active" | "disabled" | "invited";
  lastLoginAt: Date | null;
}

export function createAuthSession(
  user: AuthSessionUserRecord,
  env: JwtSigningEnvironment,
  refreshToken?: string,
  claims: AuthMethodClaims = {
    amr: ["pwd"],
    authProvider: "password",
    authChannel: "password",
    authTime: Math.floor(Date.now() / 1000),
  },
): AuthSessionView {
  const expiresIn = readExpiresInSeconds(env.AUTH_JWT_EXPIRES_IN_SECONDS);
  const view = toAuthenticatedUserView(user);
  return {
    user: view,
    accessToken: signJwt(
      {
        sub: view.id,
        tid: view.tenantId,
        tenantId: view.tenantId,
        email: view.email,
        name: view.displayName,
        locale: view.locale,
        theme: view.theme,
        roles: view.roles,
        permissions: view.permissions,
        ...(claims.amr ? { amr: claims.amr } : {}),
        ...(claims.authProvider ? { auth_provider: claims.authProvider } : {}),
        ...(claims.authChannel ? { auth_channel: claims.authChannel } : {}),
        ...(claims.authTime ? { auth_time: claims.authTime } : {}),
        ...(claims.externalIdentityId
          ? { external_identity_id: claims.externalIdentityId }
          : {}),
      },
      env,
      expiresIn,
    ),
    tokenType: "Bearer",
    expiresIn,
    ...(claims.amr ? { amr: claims.amr } : {}),
    ...(claims.authProvider ? { authProvider: claims.authProvider } : {}),
    ...(claims.authChannel ? { authChannel: claims.authChannel } : {}),
    ...(claims.authTime ? { authTime: claims.authTime } : {}),
    ...(claims.externalIdentityId
      ? { externalIdentityId: claims.externalIdentityId }
      : {}),
    ...(refreshToken ? { refreshToken } : {}),
  };
}

export function toSessionPrincipal(
  session: AuthSessionView,
): AuthenticatedPrincipal {
  return {
    subject: session.user.id,
    tenantId: session.user.tenantId,
    email: session.user.email ?? undefined,
    displayName: session.user.displayName,
    locale: session.user.locale as Language,
    theme: session.user.theme,
    roles: session.user.roles,
    permissions: session.user.permissions,
    amr: session.amr,
    authProvider: session.authProvider,
    authChannel: session.authChannel,
    authTime: session.authTime,
    externalIdentityId: session.externalIdentityId,
  };
}
