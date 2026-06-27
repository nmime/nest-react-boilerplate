import {
  getRequiredApiBaseUrl,
  type FrontendEnv,
} from "@app/frontend/api-support";

export const getFrontendEnv = (): FrontendEnv =>
  import.meta.env as Readonly<Record<string, boolean | string | undefined>>;

export const getAuthApiBaseUrl = (): string =>
  getRequiredApiBaseUrl(getFrontendEnv(), "VITE_AUTH_API_BASE_URL");

export const getUserApiBaseUrl = (): string =>
  getRequiredApiBaseUrl(getFrontendEnv(), "VITE_USER_API_BASE_URL");
