export const authProviders = ["password", "telegram", "discord"] as const;
export type AuthProvider = (typeof authProviders)[number];

export const authProviderChannels = [
  "password",
  "telegram_web_login",
  "telegram_tma",
  "telegram_bot",
  "discord_oauth",
  "discord_bot",
] as const;
export type AuthProviderChannel = (typeof authProviderChannels)[number];

export const externalAuthProviders = ["telegram", "discord"] as const;
export type ExternalAuthProvider = (typeof externalAuthProviders)[number];

export const externalAuthProviderChannels = [
  "telegram_web_login",
  "telegram_tma",
  "telegram_bot",
  "discord_oauth",
  "discord_bot",
] as const;
export type ExternalAuthProviderChannel =
  (typeof externalAuthProviderChannels)[number];

export type ExternalAuthIntent = "login" | "link";

export const externalAuthErrorCodes = [
  "provider_disabled",
  "provider_not_configured",
  "invalid_signature",
  "invalid_state",
  "account_conflict",
  "needs_link",
  "link_token_expired",
  "link_token_consumed",
  "step_up_required",
  "last_method_unlink_forbidden",
  "return_url_not_allowed",
] as const;
export type ExternalAuthErrorCode = (typeof externalAuthErrorCodes)[number];

export interface AuthMethodClaims {
  amr?: string[];
  authProvider?: AuthProvider;
  authChannel?: AuthProviderChannel;
  authTime?: number;
  externalIdentityId?: string;
}

export interface ExternalAuthIdentityView {
  id: string;
  provider: ExternalAuthProvider;
  providerSubject: string;
  channel: ExternalAuthProviderChannel;
  email: string | null;
  emailVerified: boolean | null;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  linkedAt: string;
  lastAuthenticatedAt: string | null;
}

export interface ExternalAuthResult {
  status: "authenticated" | "linked" | "needs_link" | "conflict";
  code?: ExternalAuthErrorCode;
  message?: string;
  session?: unknown;
  identity?: ExternalAuthIdentityView;
  returnUrl?: string;
}

export interface LinkTokenResult {
  token: string;
  expiresAt: string;
  provider: ExternalAuthProvider;
  intent: ExternalAuthIntent;
}
