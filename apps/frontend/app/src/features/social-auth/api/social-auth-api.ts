import {
  authApi,
  throwOnOpenApiErrorData,
  type AuthApiClient,
} from "@app/api-client";
import type { SocialAuthIntent } from "../model/types";

export const providerIdentitiesQueryKey = () =>
  authApi.getAuthControllerProviderIdentitiesQueryKey();

export interface SocialAuthRequestInput {
  intent?: SocialAuthIntent;
  linkToken?: string;
  returnUrl?: string;
}

export const requestDiscordAuthorization = async (
  authClient: AuthApiClient,
  input: SocialAuthRequestInput,
) =>
  throwOnOpenApiErrorData(
    authClient.api.authControllerDiscordAuthorizationRequest(
      input,
      authClient.requestOptions,
    ),
  );

export const submitTelegramWebLogin = async (
  authClient: AuthApiClient,
  payload: Record<string, unknown>,
  input: SocialAuthRequestInput = {},
) =>
  throwOnOpenApiErrorData(
    authClient.api.authControllerTelegramWebLogin(
      { ...input, payload },
      authClient.requestOptions,
    ),
  );

export const submitTelegramTma = async (
  authClient: AuthApiClient,
  initData: string,
  input: SocialAuthRequestInput = {},
) =>
  throwOnOpenApiErrorData(
    authClient.api.authControllerTelegramTma(
      { ...input, initData },
      authClient.requestOptions,
    ),
  );

export const fetchProviderIdentities = async (authClient: AuthApiClient) =>
  throwOnOpenApiErrorData(
    authClient.api.authControllerProviderIdentities(authClient.requestOptions),
  );

export const unlinkProviderIdentity = async (
  authClient: AuthApiClient,
  identityId: string,
) =>
  throwOnOpenApiErrorData(
    authClient.api.authControllerUnlinkProviderIdentity(
      identityId,
      authClient.requestOptions,
    ),
  );
