import type {
  ExternalAuthIntent,
  ExternalAuthProvider,
  ExternalAuthProviderChannel,
} from "@app/backend-feature-auth-shared";

export interface VerifiedExternalProfile {
  provider: ExternalAuthProvider;
  channel: ExternalAuthProviderChannel;
  providerSubject: string;
  email?: string | null;
  emailVerified?: boolean | null;
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
  metadata?: Record<string, unknown>;
}

export interface StoredDiscordState {
  tenantId: string;
  stateHash: string;
  codeVerifier: string;
  intent: ExternalAuthIntent;
  linkToken?: string;
  returnUrl?: string;
  userId?: string;
  expiresAt: Date;
}
