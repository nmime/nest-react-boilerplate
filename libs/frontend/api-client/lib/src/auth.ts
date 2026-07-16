import { useMutation, useQuery, type UseMutationOptions, type UseQueryOptions } from '@tanstack/react-query';
import createClient from 'openapi-fetch';
import createQueryClient from 'openapi-react-query';
import type { components, paths } from './generated/auth';
import {
  type ApiClientRequestOptions,
  type ApiClientError,
  type EnvelopeData,
  type OpenApiData,
  type OpenApiError,
  throwOnOpenApiErrorData,
  toOpenApiFetchOptions,
} from './service-options';

const authRegisterPath = '/auth/register';
const authLoginPath = '/auth/login';
const authRefreshPath = '/auth/refresh';
const authMePath = '/auth/me';
const authUpdateLocalePath = '/auth/me/locale';
const authUpdatePreferencesPath = '/auth/me/preferences';
const authLocalesPath = '/auth/locales';
const authLogoutPath = '/auth/logout';
const authTelegramTmaPath = '/auth/telegram/tma';
const authTelegramOidcSessionPath = '/auth/telegram/oidc/session';
const authTelegramBotLinkPath = '/auth/telegram/bot-link';
const authDiscordAuthorizationRequestPath = '/auth/discord/authorization-request';
const authDiscordCallbackPath = '/auth/discord/callback';
const authProviderIdentitiesPath = '/auth/provider-identities';
const authProviderIdentityPath = '/auth/provider-identities/{identityId}';
const authLinkTokensPath = '/auth/link-tokens';

export const client = createClient<paths>();
export const query = createQueryClient(client);

export type AuthenticatedUserViewDto = components['schemas']['AuthenticatedUserViewDto'];
export type AuthSessionViewDto = components['schemas']['AuthSessionViewDto'];
export type RegisterDto = components['schemas']['RegisterDto'];
export type LoginDto = components['schemas']['LoginDto'];
export type RefreshTokenDto = components['schemas']['RefreshTokenDto'];
export type AuthenticatedPrincipalDto = components['schemas']['AuthenticatedPrincipalDto'];
export type MePayloadDto = components['schemas']['MePayloadDto'];
export type UpdateLocaleDto = components['schemas']['UpdateLocaleDto'];
export type UpdatePreferencesDto = components['schemas']['UpdatePreferencesDto'];
export type SupportedLocalesPayloadDto = components['schemas']['SupportedLocalesPayloadDto'];
export type LogoutPayloadDto = components['schemas']['LogoutPayloadDto'];
export type ExternalAuthResultDto = components['schemas']['ExternalAuthResultDto'];
export type TelegramTmaDto = components['schemas']['TelegramTmaDto'];
export type TelegramOidcSessionDto = components['schemas']['TelegramOidcSessionDto'];
export type TelegramBotLinkDto = components['schemas']['TelegramBotLinkDto'];
export type DiscordAuthorizationRequestDto = components['schemas']['DiscordAuthorizationRequestDto'];
export type LinkTokenDto = components['schemas']['LinkTokenDto'];
export type LinkTokenResultDto = components['schemas']['LinkTokenResultDto'];
export type ProviderIdentitiesPayloadDto = components['schemas']['Object'];
export type UnlinkProviderIdentityPayloadDto = components['schemas']['Object'];
export type DiscordCallbackQuery = NonNullable<paths[typeof authDiscordCallbackPath]['get']['parameters']['query']>;

export const authControllerRegister = (body: RegisterDto, options?: ApiClientRequestOptions) =>
  client.POST(authRegisterPath, { ...toOpenApiFetchOptions(options), body });
export type AuthControllerRegisterResponse = OpenApiData<typeof authControllerRegister>;
export type AuthControllerRegisterData = EnvelopeData<AuthControllerRegisterResponse>;
export type AuthControllerRegisterError = OpenApiError<typeof authControllerRegister>;

export const authControllerLogin = (body: LoginDto, options?: ApiClientRequestOptions) =>
  client.POST(authLoginPath, { ...toOpenApiFetchOptions(options), body });
export type AuthControllerLoginResponse = OpenApiData<typeof authControllerLogin>;
export type AuthControllerLoginData = EnvelopeData<AuthControllerLoginResponse>;
export type AuthControllerLoginError = OpenApiError<typeof authControllerLogin>;

export const authControllerRefresh = (body: RefreshTokenDto, options?: ApiClientRequestOptions) =>
  client.POST(authRefreshPath, { ...toOpenApiFetchOptions(options), body });
export type AuthControllerRefreshResponse = OpenApiData<typeof authControllerRefresh>;
export type AuthControllerRefreshData = EnvelopeData<AuthControllerRefreshResponse>;
export type AuthControllerRefreshError = OpenApiError<typeof authControllerRefresh>;

export const authControllerMe = (options?: ApiClientRequestOptions) =>
  client.GET(authMePath, toOpenApiFetchOptions(options));
export type AuthControllerMeResponse = OpenApiData<typeof authControllerMe>;
export type AuthControllerMeData = EnvelopeData<AuthControllerMeResponse>;
export type AuthControllerMeError = OpenApiError<typeof authControllerMe>;

export const authControllerUpdateLocale = (body: UpdateLocaleDto, options?: ApiClientRequestOptions) =>
  client.PATCH(authUpdateLocalePath, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AuthControllerUpdateLocaleResponse = OpenApiData<typeof authControllerUpdateLocale>;
export type AuthControllerUpdateLocaleData = EnvelopeData<AuthControllerUpdateLocaleResponse>;
export type AuthControllerUpdateLocaleError = OpenApiError<typeof authControllerUpdateLocale>;

export const authControllerUpdatePreferences = (body: UpdatePreferencesDto, options?: ApiClientRequestOptions) =>
  client.PATCH(authUpdatePreferencesPath, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AuthControllerUpdatePreferencesResponse = OpenApiData<typeof authControllerUpdatePreferences>;
export type AuthControllerUpdatePreferencesData = EnvelopeData<AuthControllerUpdatePreferencesResponse>;
export type AuthControllerUpdatePreferencesError = OpenApiError<typeof authControllerUpdatePreferences>;

export const authControllerLocales = (options?: ApiClientRequestOptions) =>
  client.GET(authLocalesPath, toOpenApiFetchOptions(options));
export type AuthControllerLocalesResponse = OpenApiData<typeof authControllerLocales>;
export type AuthControllerLocalesData = EnvelopeData<AuthControllerLocalesResponse>;
export type AuthControllerLocalesError = OpenApiError<typeof authControllerLocales>;

export const authControllerLogout = (options?: ApiClientRequestOptions) =>
  client.POST(authLogoutPath, toOpenApiFetchOptions(options));
export type AuthControllerLogoutResponse = OpenApiData<typeof authControllerLogout>;
export type AuthControllerLogoutData = EnvelopeData<AuthControllerLogoutResponse>;
export type AuthControllerLogoutError = OpenApiError<typeof authControllerLogout>;

export const authControllerTelegramTma = (body: TelegramTmaDto, options?: ApiClientRequestOptions) =>
  client.POST(authTelegramTmaPath, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AuthControllerTelegramTmaResponse = OpenApiData<typeof authControllerTelegramTma>;
export type AuthControllerTelegramTmaData = EnvelopeData<AuthControllerTelegramTmaResponse>;
export type AuthControllerTelegramTmaError = OpenApiError<typeof authControllerTelegramTma>;

export const authControllerTelegramOidcSession = (body: TelegramOidcSessionDto, options?: ApiClientRequestOptions) =>
  client.POST(authTelegramOidcSessionPath, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AuthControllerTelegramOidcSessionResponse = OpenApiData<typeof authControllerTelegramOidcSession>;
export type AuthControllerTelegramOidcSessionData = EnvelopeData<AuthControllerTelegramOidcSessionResponse>;
export type AuthControllerTelegramOidcSessionError = OpenApiError<typeof authControllerTelegramOidcSession>;

export const authControllerTelegramBotLink = (body: TelegramBotLinkDto, options?: ApiClientRequestOptions) =>
  client.POST(authTelegramBotLinkPath, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AuthControllerTelegramBotLinkResponse = OpenApiData<typeof authControllerTelegramBotLink>;
export type AuthControllerTelegramBotLinkData = EnvelopeData<AuthControllerTelegramBotLinkResponse>;
export type AuthControllerTelegramBotLinkError = OpenApiError<typeof authControllerTelegramBotLink>;

export const authControllerDiscordAuthorizationRequest = (
  body: DiscordAuthorizationRequestDto,
  options?: ApiClientRequestOptions,
) =>
  client.POST(authDiscordAuthorizationRequestPath, {
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

export const authControllerDiscordCallback = (queryParams: DiscordCallbackQuery, options?: ApiClientRequestOptions) =>
  client.GET(authDiscordCallbackPath, {
    ...toOpenApiFetchOptions(options),
    params: { query: queryParams },
  });
export type AuthControllerDiscordCallbackResponse = OpenApiData<typeof authControllerDiscordCallback>;
export type AuthControllerDiscordCallbackError = OpenApiError<typeof authControllerDiscordCallback>;

export const authControllerProviderIdentities = (options?: ApiClientRequestOptions) =>
  client.GET(authProviderIdentitiesPath, toOpenApiFetchOptions(options));
export type AuthControllerProviderIdentitiesResponse = OpenApiData<typeof authControllerProviderIdentities>;
export type AuthControllerProviderIdentitiesData = EnvelopeData<AuthControllerProviderIdentitiesResponse>;
export type AuthControllerProviderIdentitiesError = OpenApiError<typeof authControllerProviderIdentities>;

export const authControllerUnlinkProviderIdentity = (identityId: string, options?: ApiClientRequestOptions) =>
  client.DELETE(authProviderIdentityPath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { identityId } },
  });
export type AuthControllerUnlinkProviderIdentityResponse = OpenApiData<typeof authControllerUnlinkProviderIdentity>;
export type AuthControllerUnlinkProviderIdentityData = EnvelopeData<AuthControllerUnlinkProviderIdentityResponse>;
export type AuthControllerUnlinkProviderIdentityError = OpenApiError<typeof authControllerUnlinkProviderIdentity>;

export const authControllerCreateLinkToken = (body: LinkTokenDto, options?: ApiClientRequestOptions) =>
  client.POST(authLinkTokensPath, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AuthControllerCreateLinkTokenResponse = OpenApiData<typeof authControllerCreateLinkToken>;
export type AuthControllerCreateLinkTokenData = EnvelopeData<AuthControllerCreateLinkTokenResponse>;
export type AuthControllerCreateLinkTokenError = OpenApiError<typeof authControllerCreateLinkToken>;

export const getAuthControllerMeQueryKey = () => ['get', authMePath] as const;
export const getAuthControllerProviderIdentitiesQueryKey = () => ['get', authProviderIdentitiesPath] as const;
export const getAuthControllerMeQueryOptions = (
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<AuthControllerMeResponse, AuthControllerMeError> =>
  query.queryOptions('get', authMePath, toOpenApiFetchOptions(options)) as unknown as OpenApiQueryOptions<
    AuthControllerMeResponse,
    AuthControllerMeError
  >;

export const getAuthControllerLocalesQueryKey = () => ['get', authLocalesPath] as const;
export const getAuthControllerLocalesQueryOptions = (
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<AuthControllerLocalesResponse, AuthControllerLocalesError> =>
  query.queryOptions('get', authLocalesPath, toOpenApiFetchOptions(options)) as unknown as OpenApiQueryOptions<
    AuthControllerLocalesResponse,
    AuthControllerLocalesError
  >;
export const getAuthControllerUpdatePreferencesMutationKey = () => ['patch', authUpdatePreferencesPath] as const;
export const getAuthControllerTelegramTmaMutationKey = () => ['post', authTelegramTmaPath] as const;
export const getAuthControllerTelegramOidcSessionMutationKey = () => ['post', authTelegramOidcSessionPath] as const;
export const getAuthControllerTelegramBotLinkMutationKey = () => ['post', authTelegramBotLinkPath] as const;
export const getAuthControllerDiscordAuthorizationRequestMutationKey = () =>
  ['post', authDiscordAuthorizationRequestPath] as const;
export const getAuthControllerUnlinkProviderIdentityMutationKey = () => ['delete', authProviderIdentityPath] as const;
export const getAuthControllerCreateLinkTokenMutationKey = () => ['post', authLinkTokensPath] as const;

type OpenApiQueryOptions<TData, TError> = Omit<UseQueryOptions<TData, TError, TData>, 'queryFn'> & {
  queryFn: NonNullable<UseQueryOptions<TData, TError, TData>['queryFn']>;
};

type QueryConfig<TData, TError> = Omit<
  UseQueryOptions<TData, ApiClientError<TError>, TData>,
  'queryFn' | 'queryKey'
> & {
  request?: ApiClientRequestOptions;
};

type MutationConfig<TData, TError, TVariables, TContext = unknown> = Omit<
  UseMutationOptions<TData, ApiClientError<TError>, TVariables, TContext>,
  'mutationFn' | 'mutationKey'
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
}: QueryConfig<AuthControllerProviderIdentitiesData, AuthControllerProviderIdentitiesError> = {}) =>
  useQuery({
    queryKey: [...getAuthControllerProviderIdentitiesQueryKey(), request] as const,
    queryFn: () => throwOnOpenApiErrorData(authControllerProviderIdentities(request)),
    ...options,
  });

export const useAuthControllerRegisterMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<AuthControllerRegisterData, AuthControllerRegisterError, RegisterDto, TContext> = {}) =>
  useMutation({
    mutationKey: ['post', authRegisterPath] as const,
    mutationFn: (body) => throwOnOpenApiErrorData(authControllerRegister(body, request)),
    ...options,
  });

export const useAuthControllerLoginMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<AuthControllerLoginData, AuthControllerLoginError, LoginDto, TContext> = {}) =>
  useMutation({
    mutationKey: ['post', authLoginPath] as const,
    mutationFn: (body) => throwOnOpenApiErrorData(authControllerLogin(body, request)),
    ...options,
  });

export const useAuthControllerUpdateLocaleMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<AuthControllerUpdateLocaleData, AuthControllerUpdateLocaleError, UpdateLocaleDto, TContext> = {}) =>
  useMutation({
    mutationKey: ['patch', authUpdateLocalePath] as const,
    mutationFn: (body) => throwOnOpenApiErrorData(authControllerUpdateLocale(body, request)),
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
    mutationFn: (body) => throwOnOpenApiErrorData(authControllerUpdatePreferences(body, request)),
    ...options,
  });

export const useAuthControllerLogoutMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<AuthControllerLogoutData, AuthControllerLogoutError, void, TContext> = {}) =>
  useMutation({
    mutationKey: ['post', authLogoutPath] as const,
    mutationFn: () => throwOnOpenApiErrorData(authControllerLogout(request)),
    ...options,
  });

export const useAuthControllerTelegramTmaMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<AuthControllerTelegramTmaData, AuthControllerTelegramTmaError, TelegramTmaDto, TContext> = {}) =>
  useMutation({
    mutationKey: getAuthControllerTelegramTmaMutationKey(),
    mutationFn: (body) => throwOnOpenApiErrorData(authControllerTelegramTma(body, request)),
    ...options,
  });

export const useAuthControllerTelegramOidcSessionMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AuthControllerTelegramOidcSessionData,
  AuthControllerTelegramOidcSessionError,
  TelegramOidcSessionDto,
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAuthControllerTelegramOidcSessionMutationKey(),
    mutationFn: (body) => throwOnOpenApiErrorData(authControllerTelegramOidcSession(body, request)),
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
    mutationFn: (body) => throwOnOpenApiErrorData(authControllerTelegramBotLink(body, request)),
    ...options,
  });

export const useAuthControllerDiscordAuthorizationRequestMutation = <TContext = unknown>({
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
    mutationFn: (body) => throwOnOpenApiErrorData(authControllerDiscordAuthorizationRequest(body, request)),
    ...options,
  });

export const useAuthControllerUnlinkProviderIdentityMutation = <TContext = unknown>({
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
    mutationFn: (identityId) => throwOnOpenApiErrorData(authControllerUnlinkProviderIdentity(identityId, request)),
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
    mutationFn: (body) => throwOnOpenApiErrorData(authControllerCreateLinkToken(body, request)),
    ...options,
  });
