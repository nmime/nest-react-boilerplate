import type { authApi } from '@app/frontend-api-client';

export enum SocialAuthProvider {
  Telegram = 'telegram',
  Discord = 'discord',
}

export type SocialAuthIntent = 'login' | 'link';

export interface SocialAuthRequestInput {
  intent?: SocialAuthIntent;
  linkToken?: string;
  returnUrl?: string;
}

export type ExternalAuthResult = authApi.AuthControllerTelegramTmaData;

export interface ProviderIdentity {
  id: string;
  provider: SocialAuthProvider;
  providerSubject?: string;
  username?: string;
  displayName?: string;
  email?: string | null;
  avatarUrl?: string;
  linkedAt?: string;
  isLastMethod?: boolean;
}

export interface ProviderIdentitiesState {
  identities: ProviderIdentity[];
  providers: Record<SocialAuthProvider, ProviderIdentity | null>;
}
