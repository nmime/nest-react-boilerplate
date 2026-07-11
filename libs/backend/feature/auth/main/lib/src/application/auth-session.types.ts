import type { AuthSessionView, AuthenticatedUserView } from "@app/backend-feature-auth-shared";
import { AuthProvider, AuthProviderChannel } from "@app/backend-feature-auth-shared";
import type { BetterAuthUser } from "./better-auth-types";

export interface BetterAuthSessionView {
  user: BetterAuthUserView;
  expiresAt: Date;
}

export interface BetterAuthUserView extends BetterAuthUser {
  emailVerified?: boolean;
  role?: string;
  lastSignInAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export function toLegacySessionView(
  betterAuthSession: BetterAuthSessionView,
  accessToken: string,
  refreshToken?: string,
): AuthSessionView {
  return {
    accessToken,
    tokenType: "Bearer",
    expiresIn: Math.max(0, Math.floor(
      (betterAuthSession.expiresAt.getTime() - Date.now()) / 1000,
    )),
    refreshToken,
    user: toLegacyUserView(betterAuthSession.user),
    amr: ["pwd"],
    authProvider: AuthProvider.Password,
    authChannel: AuthProviderChannel.Password,
    authTime: Math.floor(Date.now() / 1000),
  };
}

export function toLegacyUserView(user: BetterAuthUserView): AuthenticatedUserView {
  return {
    id: user.id,
    tenantId: user.tenantId || "00000000-0000-0000-0000-000000000000",
    email: user.email || "",
    displayName: user.name || (user.displayName as string | undefined),
    locale: (user.locale as AuthenticatedUserView["locale"]) || undefined,
    theme: (user.theme || "system") as AuthenticatedUserView["theme"],
    roles: user.roles || [],
    permissions: user.permissions || [],
  };
}

export function toBetterAuthUser(
  user: AuthenticatedUserView,
): Omit<BetterAuthUserView, "id" | "createdAt" | "updatedAt"> {
  return {
    tenantId: user.tenantId,
    name: user.displayName || "",
    email: user.email || "",
    emailVerified: false,
    locale: user.locale || "en",
    theme: user.theme,
    roles: user.roles,
    permissions: user.permissions,
  };
}
