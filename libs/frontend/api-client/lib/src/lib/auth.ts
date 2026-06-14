import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import createClient from "openapi-fetch";
import createQueryClient from "openapi-react-query";
import type { components, paths } from "../generated/auth";
import {
  type ApiClientRequestOptions,
  type ApiClientError,
  type EnvelopeData,
  type OpenApiData,
  type OpenApiError,
  throwOnOpenApiErrorData,
  toOpenApiFetchOptions,
} from "./service-options";

const AUTH_REGISTER_PATH = "/auth/register";
const AUTH_LOGIN_PATH = "/auth/login";
const AUTH_ME_PATH = "/auth/me";
const AUTH_UPDATE_LOCALE_PATH = "/auth/me/locale";
const AUTH_UPDATE_PREFERENCES_PATH = "/auth/me/preferences";
const AUTH_LOCALES_PATH = "/auth/locales";
const AUTH_LOGOUT_PATH = "/auth/logout";
const AUTH_TELEGRAM_WEB_LOGIN_PATH = "/auth/telegram/web-login";
const AUTH_TELEGRAM_TMA_PATH = "/auth/telegram/tma";
const AUTH_TELEGRAM_BOT_LINK_PATH = "/auth/telegram/bot-link";
const AUTH_DISCORD_AUTHORIZATION_REQUEST_PATH =
  "/auth/discord/authorization-request";
const AUTH_DISCORD_CALLBACK_PATH = "/auth/discord/callback";
const AUTH_PROVIDER_IDENTITIES_PATH = "/auth/provider-identities";
const AUTH_PROVIDER_IDENTITY_PATH = "/auth/provider-identities/{identityId}";
const AUTH_LINK_TOKENS_PATH = "/auth/link-tokens";

export const client = createClient<paths>();
export const query = createQueryClient(client);

export type AuthenticatedUserViewDto =
  components["schemas"]["AuthenticatedUserViewDto"];
export type AuthSessionViewDto = components["schemas"]["AuthSessionViewDto"];
export type RegisterDto = components["schemas"]["RegisterDto"];
export type LoginDto = components["schemas"]["LoginDto"];
export type AuthenticatedPrincipalDto =
  components["schemas"]["AuthenticatedPrincipalDto"];
export type MePayloadDto = components["schemas"]["MePayloadDto"];
export type UpdateLocaleDto = components["schemas"]["UpdateLocaleDto"];
export type UpdatePreferencesDto =
  components["schemas"]["UpdatePreferencesDto"];
export type SupportedLocalesPayloadDto =
  components["schemas"]["SupportedLocalesPayloadDto"];
export type LogoutPayloadDto = components["schemas"]["LogoutPayloadDto"];
export type ExternalAuthResultDto =
  components["schemas"]["ExternalAuthResultDto"];
export type TelegramWebLoginDto = components["schemas"]["TelegramWebLoginDto"];
export type TelegramTmaDto = components["schemas"]["TelegramTmaDto"];
export type TelegramBotLinkDto = components["schemas"]["TelegramBotLinkDto"];
export type DiscordAuthorizationRequestDto =
  components["schemas"]["DiscordAuthorizationRequestDto"];
export type LinkTokenDto = components["schemas"]["LinkTokenDto"];
export type LinkTokenResultDto = components["schemas"]["LinkTokenResultDto"];
export type ProviderIdentitiesPayloadDto = components["schemas"]["Object"];
export type UnlinkProviderIdentityPayloadDto = components["schemas"]["Object"];
export type DiscordCallbackQuery = NonNullable<
  paths[typeof AUTH_DISCORD_CALLBACK_PATH]["get"]["parameters"]["query"]
>;

export const authControllerRegister = (
  body: RegisterDto,
  options?: ApiClientRequestOptions,
) =>
  client.POST(AUTH_REGISTER_PATH, { ...toOpenApiFetchOptions(options), body });
export type AuthControllerRegisterResponse = OpenApiData<
  typeof authControllerRegister
>;
export type AuthControllerRegisterData =
  EnvelopeData<AuthControllerRegisterResponse>;
export type AuthControllerRegisterError = OpenApiError<
  typeof authControllerRegister
>;

export const authControllerLogin = (
  body: LoginDto,
  options?: ApiClientRequestOptions,
) => client.POST(AUTH_LOGIN_PATH, { ...toOpenApiFetchOptions(options), body });
export type AuthControllerLoginResponse = OpenApiData<
  typeof authControllerLogin
>;
export type AuthControllerLoginData = EnvelopeData<AuthControllerLoginResponse>;
export type AuthControllerLoginError = OpenApiError<typeof authControllerLogin>;

export const authControllerMe = (options?: ApiClientRequestOptions) =>
  client.GET(AUTH_ME_PATH, toOpenApiFetchOptions(options));
export type AuthControllerMeResponse = OpenApiData<typeof authControllerMe>;
export type AuthControllerMeData = EnvelopeData<AuthControllerMeResponse>;
export type AuthControllerMeError = OpenApiError<typeof authControllerMe>;

export const authControllerUpdateLocale = (
  body: UpdateLocaleDto,
  options?: ApiClientRequestOptions,
) =>
  client.PATCH(AUTH_UPDATE_LOCALE_PATH, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AuthControllerUpdateLocaleResponse = OpenApiData<
  typeof authControllerUpdateLocale
>;
export type AuthControllerUpdateLocaleData =
  EnvelopeData<AuthControllerUpdateLocaleResponse>;
export type AuthControllerUpdateLocaleError = OpenApiError<
  typeof authControllerUpdateLocale
>;

export const authControllerUpdatePreferences = (
  body: UpdatePreferencesDto,
  options?: ApiClientRequestOptions,
) =>
  client.PATCH(AUTH_UPDATE_PREFERENCES_PATH, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AuthControllerUpdatePreferencesResponse = OpenApiData<
  typeof authControllerUpdatePreferences
>;
export type AuthControllerUpdatePreferencesData =
  EnvelopeData<AuthControllerUpdatePreferencesResponse>;
export type AuthControllerUpdatePreferencesError = OpenApiError<
  typeof authControllerUpdatePreferences
>;

export const authControllerLocales = (options?: ApiClientRequestOptions) =>
  client.GET(AUTH_LOCALES_PATH, toOpenApiFetchOptions(options));
export type AuthControllerLocalesResponse = OpenApiData<
  typeof authControllerLocales
>;
export type AuthControllerLocalesData =
  EnvelopeData<AuthControllerLocalesResponse>;
export type AuthControllerLocalesError = OpenApiError<
  typeof authControllerLocales
>;

export const authControllerLogout = (options?: ApiClientRequestOptions) =>
  client.POST(AUTH_LOGOUT_PATH, toOpenApiFetchOptions(options));
export type AuthControllerLogoutResponse = OpenApiData<
  typeof authControllerLogout
>;
export type AuthControllerLogoutData =
  EnvelopeData<AuthControllerLogoutResponse>;
export type AuthControllerLogoutError = OpenApiError<
  typeof authControllerLogout
>;

export const authControllerTelegramWebLogin = (
  body: TelegramWebLoginDto,
  options?: ApiClientRequestOptions,
) =>
  client.POST(AUTH_TELEGRAM_WEB_LOGIN_PATH, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AuthControllerTelegramWebLoginResponse = OpenApiData<
  typeof authControllerTelegramWebLogin
>;
export type AuthControllerTelegramWebLoginData =
  EnvelopeData<AuthControllerTelegramWebLoginResponse>;
export type AuthControllerTelegramWebLoginError = OpenApiError<
  typeof authControllerTelegramWebLogin
>;

export const authControllerTelegramTma = (
  body: TelegramTmaDto,
  options?: ApiClientRequestOptions,
) =>
  client.POST(AUTH_TELEGRAM_TMA_PATH, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AuthControllerTelegramTmaResponse = OpenApiData<
  typeof authControllerTelegramTma
>;
export type AuthControllerTelegramTmaData =
  EnvelopeData<AuthControllerTelegramTmaResponse>;
export type AuthControllerTelegramTmaError = OpenApiError<
  typeof authControllerTelegramTma
>;

export const authControllerTelegramBotLink = (
  body: TelegramBotLinkDto,
  options?: ApiClientRequestOptions,
) =>
  client.POST(AUTH_TELEGRAM_BOT_LINK_PATH, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AuthControllerTelegramBotLinkResponse = OpenApiData<
  typeof authControllerTelegramBotLink
>;
export type AuthControllerTelegramBotLinkData =
  EnvelopeData<AuthControllerTelegramBotLinkResponse>;
export type AuthControllerTelegramBotLinkError = OpenApiError<
  typeof authControllerTelegramBotLink
>;

export const authControllerDiscordAuthorizationRequest = (
  body: DiscordAuthorizationRequestDto,
  options?: ApiClientRequestOptions,
) =>
  client.POST(AUTH_DISCORD_AUTHORIZATION_REQUEST_PATH, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AuthControllerDiscordAuthorizationRequestResponse = OpenApiData<
  typeof authControllerDiscordAuthorizationRequest
>;
export type AuthControllerDiscordAuthorizationRequestData =
  EnvelopeData<AuthControllerDiscordAuthorizationRequestResponse>;
export type AuthControllerDiscordAuthorizationRequestError = OpenApiError<
  typeof authControllerDiscordAuthorizationRequest
>;

export const authControllerDiscordCallback = (
  queryParams: DiscordCallbackQuery,
  options?: ApiClientRequestOptions,
) =>
  client.GET(AUTH_DISCORD_CALLBACK_PATH, {
    ...toOpenApiFetchOptions(options),
    params: { query: queryParams },
  });
export type AuthControllerDiscordCallbackResponse = OpenApiData<
  typeof authControllerDiscordCallback
>;
export type AuthControllerDiscordCallbackError = OpenApiError<
  typeof authControllerDiscordCallback
>;

export const authControllerProviderIdentities = (
  options?: ApiClientRequestOptions,
) => client.GET(AUTH_PROVIDER_IDENTITIES_PATH, toOpenApiFetchOptions(options));
export type AuthControllerProviderIdentitiesResponse = OpenApiData<
  typeof authControllerProviderIdentities
>;
export type AuthControllerProviderIdentitiesData =
  EnvelopeData<AuthControllerProviderIdentitiesResponse>;
export type AuthControllerProviderIdentitiesError = OpenApiError<
  typeof authControllerProviderIdentities
>;

export const authControllerUnlinkProviderIdentity = (
  identityId: string,
  options?: ApiClientRequestOptions,
) =>
  client.DELETE(AUTH_PROVIDER_IDENTITY_PATH, {
    ...toOpenApiFetchOptions(options),
    params: { path: { identityId } },
  });
export type AuthControllerUnlinkProviderIdentityResponse = OpenApiData<
  typeof authControllerUnlinkProviderIdentity
>;
export type AuthControllerUnlinkProviderIdentityData =
  EnvelopeData<AuthControllerUnlinkProviderIdentityResponse>;
export type AuthControllerUnlinkProviderIdentityError = OpenApiError<
  typeof authControllerUnlinkProviderIdentity
>;

export const authControllerCreateLinkToken = (
  body: LinkTokenDto,
  options?: ApiClientRequestOptions,
) =>
  client.POST(AUTH_LINK_TOKENS_PATH, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AuthControllerCreateLinkTokenResponse = OpenApiData<
  typeof authControllerCreateLinkToken
>;
export type AuthControllerCreateLinkTokenData =
  EnvelopeData<AuthControllerCreateLinkTokenResponse>;
export type AuthControllerCreateLinkTokenError = OpenApiError<
  typeof authControllerCreateLinkToken
>;

export const getAuthControllerMeQueryKey = () => ["get", AUTH_ME_PATH] as const;
export const getAuthControllerProviderIdentitiesQueryKey = () =>
  ["get", AUTH_PROVIDER_IDENTITIES_PATH] as const;
export const getAuthControllerMeQueryOptions = (
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<AuthControllerMeResponse, AuthControllerMeError> =>
  query.queryOptions(
    "get",
    AUTH_ME_PATH,
    toOpenApiFetchOptions(options),
  ) as unknown as OpenApiQueryOptions<
    AuthControllerMeResponse,
    AuthControllerMeError
  >;

export const getAuthControllerLocalesQueryKey = () =>
  ["get", AUTH_LOCALES_PATH] as const;
export const getAuthControllerLocalesQueryOptions = (
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<
  AuthControllerLocalesResponse,
  AuthControllerLocalesError
> =>
  query.queryOptions(
    "get",
    AUTH_LOCALES_PATH,
    toOpenApiFetchOptions(options),
  ) as unknown as OpenApiQueryOptions<
    AuthControllerLocalesResponse,
    AuthControllerLocalesError
  >;
export const getAuthControllerUpdatePreferencesMutationKey = () =>
  ["patch", AUTH_UPDATE_PREFERENCES_PATH] as const;
export const getAuthControllerTelegramWebLoginMutationKey = () =>
  ["post", AUTH_TELEGRAM_WEB_LOGIN_PATH] as const;
export const getAuthControllerTelegramTmaMutationKey = () =>
  ["post", AUTH_TELEGRAM_TMA_PATH] as const;
export const getAuthControllerTelegramBotLinkMutationKey = () =>
  ["post", AUTH_TELEGRAM_BOT_LINK_PATH] as const;
export const getAuthControllerDiscordAuthorizationRequestMutationKey = () =>
  ["post", AUTH_DISCORD_AUTHORIZATION_REQUEST_PATH] as const;
export const getAuthControllerUnlinkProviderIdentityMutationKey = () =>
  ["delete", AUTH_PROVIDER_IDENTITY_PATH] as const;
export const getAuthControllerCreateLinkTokenMutationKey = () =>
  ["post", AUTH_LINK_TOKENS_PATH] as const;

type OpenApiQueryOptions<TData, TError> = Omit<
  UseQueryOptions<TData, TError, TData, readonly unknown[]>,
  "queryFn"
> & {
  queryFn: NonNullable<
    UseQueryOptions<TData, TError, TData, readonly unknown[]>["queryFn"]
  >;
};

type QueryConfig<TData, TError> = Omit<
  UseQueryOptions<TData, ApiClientError<TError>, TData, readonly unknown[]>,
  "queryFn" | "queryKey"
> & {
  request?: ApiClientRequestOptions;
};

type MutationConfig<TData, TError, TVariables, TContext = unknown> = Omit<
  UseMutationOptions<TData, ApiClientError<TError>, TVariables, TContext>,
  "mutationFn" | "mutationKey"
> & {
  request?: ApiClientRequestOptions;
};

export const useAuthControllerMeQuery = ({
  request,
  ...options
}: QueryConfig<AuthControllerMeData, AuthControllerMeError> = {}) =>
  useQuery({
    queryKey: [...getAuthControllerMeQueryKey(), request] as const,
    queryFn: () => throwOnOpenApiErrorData(authControllerMe(request)),
    ...options,
  });

export const useAuthControllerLocalesQuery = ({
  request,
  ...options
}: QueryConfig<AuthControllerLocalesData, AuthControllerLocalesError> = {}) =>
  useQuery({
    queryKey: [...getAuthControllerLocalesQueryKey(), request] as const,
    queryFn: () => throwOnOpenApiErrorData(authControllerLocales(request)),
    ...options,
  });

export const useAuthControllerProviderIdentitiesQuery = ({
  request,
  ...options
}: QueryConfig<
  AuthControllerProviderIdentitiesData,
  AuthControllerProviderIdentitiesError
> = {}) =>
  useQuery({
    queryKey: [
      ...getAuthControllerProviderIdentitiesQueryKey(),
      request,
    ] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(authControllerProviderIdentities(request)),
    ...options,
  });

export const useAuthControllerRegisterMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AuthControllerRegisterData,
  AuthControllerRegisterError,
  RegisterDto,
  TContext
> = {}) =>
  useMutation({
    mutationKey: ["post", AUTH_REGISTER_PATH] as const,
    mutationFn: (body) =>
      throwOnOpenApiErrorData(authControllerRegister(body, request)),
    ...options,
  });

export const useAuthControllerLoginMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AuthControllerLoginData,
  AuthControllerLoginError,
  LoginDto,
  TContext
> = {}) =>
  useMutation({
    mutationKey: ["post", AUTH_LOGIN_PATH] as const,
    mutationFn: (body) =>
      throwOnOpenApiErrorData(authControllerLogin(body, request)),
    ...options,
  });

export const useAuthControllerUpdateLocaleMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AuthControllerUpdateLocaleData,
  AuthControllerUpdateLocaleError,
  UpdateLocaleDto,
  TContext
> = {}) =>
  useMutation({
    mutationKey: ["patch", AUTH_UPDATE_LOCALE_PATH] as const,
    mutationFn: (body) =>
      throwOnOpenApiErrorData(authControllerUpdateLocale(body, request)),
    ...options,
  });

export const useAuthControllerUpdatePreferencesMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AuthControllerUpdatePreferencesData,
  AuthControllerUpdatePreferencesError,
  UpdatePreferencesDto,
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAuthControllerUpdatePreferencesMutationKey(),
    mutationFn: (body) =>
      throwOnOpenApiErrorData(authControllerUpdatePreferences(body, request)),
    ...options,
  });

export const useAuthControllerLogoutMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AuthControllerLogoutData,
  AuthControllerLogoutError,
  void,
  TContext
> = {}) =>
  useMutation({
    mutationKey: ["post", AUTH_LOGOUT_PATH] as const,
    mutationFn: () => throwOnOpenApiErrorData(authControllerLogout(request)),
    ...options,
  });

export const useAuthControllerTelegramWebLoginMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AuthControllerTelegramWebLoginData,
  AuthControllerTelegramWebLoginError,
  TelegramWebLoginDto,
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAuthControllerTelegramWebLoginMutationKey(),
    mutationFn: (body) =>
      throwOnOpenApiErrorData(authControllerTelegramWebLogin(body, request)),
    ...options,
  });

export const useAuthControllerTelegramTmaMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AuthControllerTelegramTmaData,
  AuthControllerTelegramTmaError,
  TelegramTmaDto,
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAuthControllerTelegramTmaMutationKey(),
    mutationFn: (body) =>
      throwOnOpenApiErrorData(authControllerTelegramTma(body, request)),
    ...options,
  });

export const useAuthControllerTelegramBotLinkMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AuthControllerTelegramBotLinkData,
  AuthControllerTelegramBotLinkError,
  TelegramBotLinkDto,
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAuthControllerTelegramBotLinkMutationKey(),
    mutationFn: (body) =>
      throwOnOpenApiErrorData(authControllerTelegramBotLink(body, request)),
    ...options,
  });

export const useAuthControllerDiscordAuthorizationRequestMutation = <
  TContext = unknown,
>({
  request,
  ...options
}: MutationConfig<
  AuthControllerDiscordAuthorizationRequestData,
  AuthControllerDiscordAuthorizationRequestError,
  DiscordAuthorizationRequestDto,
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAuthControllerDiscordAuthorizationRequestMutationKey(),
    mutationFn: (body) =>
      throwOnOpenApiErrorData(
        authControllerDiscordAuthorizationRequest(body, request),
      ),
    ...options,
  });

export const useAuthControllerUnlinkProviderIdentityMutation = <
  TContext = unknown,
>({
  request,
  ...options
}: MutationConfig<
  AuthControllerUnlinkProviderIdentityData,
  AuthControllerUnlinkProviderIdentityError,
  string,
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAuthControllerUnlinkProviderIdentityMutationKey(),
    mutationFn: (identityId) =>
      throwOnOpenApiErrorData(
        authControllerUnlinkProviderIdentity(identityId, request),
      ),
    ...options,
  });

export const useAuthControllerCreateLinkTokenMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AuthControllerCreateLinkTokenData,
  AuthControllerCreateLinkTokenError,
  LinkTokenDto,
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAuthControllerCreateLinkTokenMutationKey(),
    mutationFn: (body) =>
      throwOnOpenApiErrorData(authControllerCreateLinkToken(body, request)),
    ...options,
  });
