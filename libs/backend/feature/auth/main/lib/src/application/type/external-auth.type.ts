import type {
  AuthProvider,
  AuthProviderChannel,
  AuthSessionView,
  ExternalAuthIdentityView,
  ExternalAuthIntent,
} from '@app/backend-feature-auth-shared';

export interface ExternalAuthSessionClaims {
  amr: string[];
  authProvider: AuthProvider;
  authChannel: AuthProviderChannel;
  authTime: number;
  externalIdentityId?: string;
}

export interface TelegramWebLoginInput {
  tenantId?: string | null;
  intent?: ExternalAuthIntent;
  linkToken?: string | null;
  returnUrl?: string | null;
  payload: Record<string, string | number | boolean | null | undefined>;
  principal?: { subject: string; tenantId: string } | null;
}

export interface TelegramTmaInput {
  tenantId?: string | null;
  intent?: ExternalAuthIntent;
  initData: string;
  linkToken?: string | null;
  returnUrl?: string | null;
  principal?: { subject: string; tenantId: string } | null;
}

export interface TelegramBotLinkInput {
  tenantId?: string | null;
  linkToken: string;
  providerSubject: string;
  username?: string | null;
  displayName?: string | null;
  locale?: string | null;
  avatarUrl?: string | null;
}

export interface DiscordAuthorizationRequestInput {
  tenantId?: string | null;
  intent?: ExternalAuthIntent;
  linkToken?: string | null;
  returnUrl?: string | null;
  principal?: { subject: string; tenantId: string } | null;
}

export interface DiscordCallbackInput {
  tenantId?: string | null;
  code?: string | null;
  state?: string | null;
  principal?: { subject: string; tenantId: string } | null;
}

export interface DiscordAuthorizationRequestResult {
  authorizationUrl: string;
  stateExpiresAt: string;
}

export interface ExternalAuthLoginResult {
  status: 'authenticated' | 'linked' | 'needs_link' | 'conflict';
  code?: string;
  message?: string;
  session?: AuthSessionView;
  identity?: ExternalAuthIdentityView;
  returnUrl?: string;
}
