import { createContext, useContext, useMemo, type ReactNode } from "react";

import * as adminApi from "./admin";
import * as authApi from "./auth";
import type { ApiClientRequestOptions } from "./service-options";
import * as userApi from "./user";

export type ApiServiceName = "admin" | "auth" | "user";

export interface ApiClientRuntimeConfig {
  authToken?: string | null;
  baseUrls: Record<ApiServiceName, string>;
  fetchImpl?: typeof fetch;
  headers?: HeadersInit;
}

export interface ApiServiceClient<TApi> {
  readonly api: TApi;
  readonly requestOptions: ApiClientRequestOptions;
}

export type AuthApiClient = ApiServiceClient<typeof authApi>;
export type UserApiClient = ApiServiceClient<typeof userApi>;
export type AdminApiClient = ApiServiceClient<typeof adminApi>;

export interface ApiClientRegistry {
  readonly admin: AdminApiClient;
  readonly auth: AuthApiClient;
  readonly user: UserApiClient;
}

const normalizeAuthToken = (authToken?: string | null): string | undefined =>
  authToken?.trim() || undefined;

const buildServiceRequestOptions = (
  service: ApiServiceName,
  config: ApiClientRuntimeConfig,
): ApiClientRequestOptions => ({
  authToken: normalizeAuthToken(config.authToken),
  baseUrl: config.baseUrls[service],
  fetchImpl: config.fetchImpl,
  headers: config.headers,
});

export const createApiClientRegistry = (
  config: ApiClientRuntimeConfig,
): ApiClientRegistry => ({
  admin: {
    api: adminApi,
    requestOptions: buildServiceRequestOptions("admin", config),
  },
  auth: {
    api: authApi,
    requestOptions: buildServiceRequestOptions("auth", config),
  },
  user: {
    api: userApi,
    requestOptions: buildServiceRequestOptions("user", config),
  },
});

const ApiClientRegistryContext = createContext<ApiClientRegistry | null>(null);

export interface ApiClientRegistryProviderProps {
  children: ReactNode;
  registry: ApiClientRegistry;
}

export const ApiClientRegistryProvider = ({
  children,
  registry,
}: ApiClientRegistryProviderProps) => (
  <ApiClientRegistryContext.Provider value={registry}>
    {children}
  </ApiClientRegistryContext.Provider>
);

export const useApiClientRegistry = (): ApiClientRegistry => {
  const registry = useContext(ApiClientRegistryContext);
  if (!registry) {
    throw new Error(
      "useApiClientRegistry must be used within ApiClientRegistryProvider.",
    );
  }

  return registry;
};

export interface ApiClientProviderProps extends ApiClientRuntimeConfig {
  children: ReactNode;
}

export const ApiClientProvider = ({
  children,
  ...config
}: ApiClientProviderProps) => {
  const registry = useMemo(
    () => createApiClientRegistry(config),
    [
      config.authToken,
      config.baseUrls.admin,
      config.baseUrls.auth,
      config.baseUrls.user,
      config.fetchImpl,
      config.headers,
    ],
  );

  return (
    <ApiClientRegistryProvider registry={registry}>
      {children}
    </ApiClientRegistryProvider>
  );
};

export const useAuthApiClient = (): AuthApiClient =>
  useApiClientRegistry().auth;
export const useUserApiClient = (): UserApiClient =>
  useApiClientRegistry().user;
export const useAdminApiClient = (): AdminApiClient =>
  useApiClientRegistry().admin;
