export * as adminApi from "./lib/admin";
export * as authApi from "./lib/auth";
export * as userApi from "./lib/user";
export * as generatedAdminApi from "./generated/admin";
export * as generatedAuthApi from "./generated/auth";
export * as generatedUserApi from "./generated/user";
export {
  adminApiToastRules,
  authApiToastRules,
  userApiToastRules,
} from "./lib/toast-rules";
export {
  ApiClientError,
  isApiClientError,
  throwOnOpenApiError,
  throwOnOpenApiErrorData,
  unwrapEnvelopeData,
  type ApiClientRequestOptions,
  type EnvelopeData,
  type OpenApiData,
  type OpenApiError,
} from "./lib/service-options";
export {
  ApiClientProvider,
  ApiClientRegistryProvider,
  createApiClientRegistry,
  useAdminApiClient,
  useApiClientRegistry,
  useAuthApiClient,
  useUserApiClient,
  type AdminApiClient,
  type ApiClientProviderProps,
  type ApiClientRegistry,
  type ApiClientRegistryProviderProps,
  type ApiClientRuntimeConfig,
  type ApiServiceClient,
  type ApiServiceName,
  type AuthApiClient,
  type UserApiClient,
} from "./lib/client-registry";
