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

const readEnvString = (key: string): string => {
  const value = getFrontendEnv()[key];
  return typeof value === "string" ? value.trim() : "";
};

const hasConfiguredApiOrigin = (key: string): boolean =>
  readEnvString(key).replace(/\/$/u, "").length > 0;

export const getUserAppApiModeLabel = (): string => {
  if (readEnvString("VITE_API_BASE_URL_MODE").toLowerCase() === "same-origin") {
    return "Same-origin API proxy";
  }

  if (
    hasConfiguredApiOrigin("VITE_AUTH_API_BASE_URL") &&
    hasConfiguredApiOrigin("VITE_USER_API_BASE_URL")
  ) {
    return "Explicit API origins";
  }

  const mode = readEnvString("MODE").toLowerCase();
  if (
    getFrontendEnv()["DEV"] === true ||
    mode === "development" ||
    mode === "test"
  ) {
    return "Development same-origin fallback";
  }

  return "Production API origins required";
};
