export {
  getExternalAuthStatus,
  getProviderTranslationKey,
  normalizeProviderIdentities,
  normalizeProviderIdentity,
  socialAuthProviders,
} from "./provider-utils";
export {
  getReturnUrlFromExternalAuthResult,
  getSessionFromExternalAuthResult,
} from "./session";
export {
  useSocialAuth,
  type SocialAuthNavigateOptions,
} from "./use-social-auth";
export type {
  ExternalAuthResult,
  ProviderIdentitiesState,
  ProviderIdentity,
  SocialAuthIntent,
  SocialAuthProvider,
} from "./types";
