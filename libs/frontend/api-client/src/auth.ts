import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import createClient from "openapi-fetch";
import createQueryClient from "openapi-react-query";
import type { components, paths } from "./generated/auth";
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
const AUTH_LOCALES_PATH = "/auth/locales";
const AUTH_LOGOUT_PATH = "/auth/logout";

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
export type SupportedLocalesPayloadDto =
  components["schemas"]["SupportedLocalesPayloadDto"];
export type LogoutPayloadDto = components["schemas"]["LogoutPayloadDto"];

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

export const getAuthControllerMeQueryKey = () => ["get", AUTH_ME_PATH] as const;
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
