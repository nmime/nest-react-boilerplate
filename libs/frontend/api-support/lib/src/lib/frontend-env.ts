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

export type FrontendBuildEnv = Record<string, string | undefined>;

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

const isNonProductionFrontendBuild = (command: string, mode: string): boolean =>
  command !== "build" || mode === "development" || mode === "test";

export const getDefaultFrontendBuildApiBaseUrlMode = (
  env: FrontendEnv,
  command: string,
  mode: string,
): string | undefined => {
  if (
    isNonProductionFrontendBuild(command, mode) ||
    getEnvString(env, "VITE_API_BASE_URL_MODE") ||
    frontendApiBaseUrlKeys.some((key) => getEnvString(env, key))
  ) {
    return undefined;
  }

  return sameOriginApiMode;
};

export const applyDefaultFrontendBuildApiBaseUrlMode = (
  env: FrontendBuildEnv,
  command: string,
  mode: string,
): boolean => {
  const defaultMode = getDefaultFrontendBuildApiBaseUrlMode(env, command, mode);
  if (!defaultMode) {
    return false;
  }

  env["VITE_API_BASE_URL_MODE"] = defaultMode;
  return true;
};

export const normalizeApiBaseUrl = (value: string): string =>
  value.trim().replace(/\/$/u, "");

export const getApiBaseUrl = (
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

export const getRequiredApiBaseUrl = getApiBaseUrl;

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

export const assertRequiredFrontendBuildApiBaseUrls = (
  env: FrontendEnv,
  command: string,
  mode: string,
  keys: readonly FrontendApiBaseUrlKey[] = frontendApiBaseUrlKeys,
): void => {
  if (isNonProductionFrontendBuild(command, mode)) {
    return;
  }

  assertRequiredFrontendApiBaseUrls(env, keys);
};
