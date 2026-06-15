import type { authApi } from "@app/api-client";

export type SocialAuthProvider = "telegram" | "discord";
export type SocialAuthIntent = "login" | "link";

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
