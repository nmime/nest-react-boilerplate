import {
  authApi,
  establishTelegramTmaBetterAuthSession,
  requestTelegramOidcAuthorization,
  throwOnOpenApiErrorData,
  type AuthApiClient,
} from '@app/frontend-api-client';
import type { SocialAuthRequestInput } from '../model/types';

export const providerIdentitiesQueryKey = () => authApi.getAuthControllerProviderIdentitiesQueryKey();

export type DiscordCallbackInput = authApi.DiscordCallbackQuery;

export const requestDiscordAuthorization = async (authClient: AuthApiClient, input: SocialAuthRequestInput) =>
  throwOnOpenApiErrorData(authClient.api.authControllerDiscordAuthorizationRequest(input, authClient.requestOptions));

export const submitTelegramTma = async (
  authClient: AuthApiClient,
  initData: string,
  input: SocialAuthRequestInput = {},
) => {
  await establishTelegramTmaBetterAuthSession(authClient.requestOptions, initData);
  return throwOnOpenApiErrorData(
    authClient.api.authControllerTelegramTma({ ...input, initData }, authClient.requestOptions),
  );
};

export const startTelegramOidc = async (authClient: AuthApiClient, callbackURL: string) =>
  requestTelegramOidcAuthorization(authClient.requestOptions, {
    callbackURL,
    errorCallbackURL: callbackURL,
  });

export const submitTelegramOidcSession = async (authClient: AuthApiClient, input: SocialAuthRequestInput = {}) =>
  throwOnOpenApiErrorData(authClient.api.authControllerTelegramOidcSession({ ...input }, authClient.requestOptions));

export const submitDiscordCallback = async (authClient: AuthApiClient, input: DiscordCallbackInput) =>
  throwOnOpenApiErrorData(authClient.api.authControllerDiscordCallback(input, authClient.requestOptions));

export const fetchProviderIdentities = async (authClient: AuthApiClient) =>
  throwOnOpenApiErrorData(authClient.api.authControllerProviderIdentities(authClient.requestOptions));

export const unlinkProviderIdentity = async (authClient: AuthApiClient, identityId: string) =>
  throwOnOpenApiErrorData(authClient.api.authControllerUnlinkProviderIdentity(identityId, authClient.requestOptions));
