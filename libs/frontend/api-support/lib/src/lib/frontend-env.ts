export type FrontendEnv = Readonly<
  Record<string, boolean | string | undefined>
>;

export const frontendApiBaseUrlKeys = [
  "VITE_AUTH_API_BASE_URL",
  "VITE_USER_API_BASE_URL",
  "VITE_ADMIN_API_BASE_URL",
] as const;

export type FrontendApiBaseUrlKey = (typeof frontendApiBaseUrlKeys)[number];

const sameOriginApiMode = "same-origin";

const getEnvString = (env: FrontendEnv, key: string): string => {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
};

export const isNonProductionFrontendEnv = (env: FrontendEnv): boolean => {
  const mode = getEnvString(env, "MODE").toLowerCase();

  return env["DEV"] === true || mode === "development" || mode === "test";
};

export const isExplicitSameOriginApiMode = (env: FrontendEnv): boolean =>
  getEnvString(env, "VITE_API_BASE_URL_MODE").toLowerCase() ===
  sameOriginApiMode;

export const normalizeApiBaseUrl = (value: string): string =>
  value.trim().replace(/\/$/u, "");

export const getRequiredApiBaseUrl = (
  env: FrontendEnv,
  key: FrontendApiBaseUrlKey,
): string => {
  const configuredValue = normalizeApiBaseUrl(getEnvString(env, key));
  if (configuredValue) {
    return configuredValue;
  }

  if (isNonProductionFrontendEnv(env) || isExplicitSameOriginApiMode(env)) {
    return "";
  }

  throw new Error(
    `${key} is required for production frontend builds/runtime. ` +
      `Set ${frontendApiBaseUrlKeys.join(", ")} to explicit API origins, ` +
      `or set VITE_API_BASE_URL_MODE=${sameOriginApiMode} to explicitly use a same-origin API proxy.`,
  );
};

export const assertRequiredFrontendApiBaseUrls = (
  env: FrontendEnv,
  keys: readonly FrontendApiBaseUrlKey[] = frontendApiBaseUrlKeys,
): void => {
  if (isNonProductionFrontendEnv(env) || isExplicitSameOriginApiMode(env)) {
    return;
  }

  const missing = keys.filter(
    (key) => !normalizeApiBaseUrl(getEnvString(env, key)),
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required production frontend API base URL env var(s): ${missing.join(", ")}. ` +
        `Set explicit API origins or set VITE_API_BASE_URL_MODE=${sameOriginApiMode} to opt into a same-origin API proxy.`,
    );
  }
};

export const isLegacyUrlBearerTokenBootstrapAllowed = (
  env: FrontendEnv,
): boolean => isNonProductionFrontendEnv(env);

export const readLegacyUrlBearerToken = (
  env: FrontendEnv,
  href: string,
): string | null => {
  if (!isLegacyUrlBearerTokenBootstrapAllowed(env)) {
    return null;
  }

  const search = new URL(href).searchParams;

  return (
    search.get("token")?.trim() ||
    search.get("admin" + "_token")?.trim() ||
    null
  );
};
