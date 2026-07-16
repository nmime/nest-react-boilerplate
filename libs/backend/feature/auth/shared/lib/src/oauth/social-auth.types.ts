import { createIsEnum } from '../util';

export enum AuthProvider {
  Password = 'password',
  Telegram = 'telegram',
  Discord = 'discord',
}

export const authProviders = Object.values(AuthProvider);
export const isAuthProvider = createIsEnum(AuthProvider);

export enum AuthProviderChannel {
  Password = 'password',
  TelegramOidc = 'telegram_oidc',
  TelegramTma = 'telegram_tma',
  TelegramBot = 'telegram_bot',
  DiscordOauth = 'discord_oauth',
  DiscordBot = 'discord_bot',
}

export const authProviderChannels = Object.values(AuthProviderChannel);
export const isAuthProviderChannel = createIsEnum(AuthProviderChannel);

export const externalAuthProviders = [AuthProvider.Telegram, AuthProvider.Discord] as const;
export type ExternalAuthProvider = (typeof externalAuthProviders)[number];

export const externalAuthProviderChannels = [
  AuthProviderChannel.TelegramOidc,
  AuthProviderChannel.TelegramTma,
  AuthProviderChannel.TelegramBot,
  AuthProviderChannel.DiscordOauth,
  AuthProviderChannel.DiscordBot,
] as const;
export type ExternalAuthProviderChannel = (typeof externalAuthProviderChannels)[number];

export enum ExternalAuthIntent {
  Login = 'login',
  Link = 'link',
}

export const externalAuthIntents = Object.values(ExternalAuthIntent);

export enum ExternalAuthErrorCode {
  ProviderDisabled = 'provider_disabled',
  ProviderNotConfigured = 'provider_not_configured',
  InvalidSignature = 'invalid_signature',
  InvalidState = 'invalid_state',
  AccountConflict = 'account_conflict',
  NeedsLink = 'needs_link',
  LinkTokenExpired = 'link_token_expired',
  LinkTokenConsumed = 'link_token_consumed',
  StepUpRequired = 'step_up_required',
  LastMethodUnlinkForbidden = 'last_method_unlink_forbidden',
  ReturnUrlNotAllowed = 'return_url_not_allowed',
}

export const externalAuthErrorCodes = Object.values(ExternalAuthErrorCode);

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
  status: 'authenticated' | 'linked' | 'needs_link' | 'conflict';
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
