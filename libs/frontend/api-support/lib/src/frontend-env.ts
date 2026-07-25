export type FrontendEnv = Readonly<Record<string, boolean | string | undefined>>;

/**
 * Per-deployment configuration injected before the app boots (see
 * `public/runtime-config.js`, rewritten at container start). It lets one
 * immutable image serve many environments, so feature flags no longer have to be
 * baked in at Vite build time.
 */
export type FrontendRuntimeConfig = Readonly<Record<string, boolean | string | undefined>>;

const runtimeConfigGlobalKey = '__APP_RUNTIME_CONFIG__';

export const getFrontendRuntimeConfig = (): FrontendRuntimeConfig => {
  const candidate = (globalThis as Record<string, unknown>)[runtimeConfigGlobalKey];

  return typeof candidate === 'object' && candidate !== null ? (candidate as FrontendRuntimeConfig) : {};
};

const parseBooleanFlag = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  return undefined;
};

/**
 * Resolve a boolean feature flag, preferring the runtime value over the value
 * baked in at build time. Unset/unparsable runtime values fall through, so a
 * deployment can only ever override a flag deliberately.
 */
export const resolveFeatureFlag = (runtimeValue: unknown, buildValue: unknown): boolean =>
  parseBooleanFlag(runtimeValue) ?? parseBooleanFlag(buildValue) ?? false;

export const frontendApiBaseUrlKeys = [
  'VITE_AUTH_API_BASE_URL',
  'VITE_USER_API_BASE_URL',
  'VITE_ADMIN_API_BASE_URL',
] as const;

export type FrontendApiBaseUrlKey = (typeof frontendApiBaseUrlKeys)[number];

const sameOriginApiMode = 'same-origin';

export type FrontendBuildEnv = Record<string, string | undefined>;

const getEnvString = (env: FrontendEnv, key: string): string => {
  const value = env[key];
  return typeof value === 'string' ? value.trim() : '';
};

export const isNonProductionFrontendEnv = (env: FrontendEnv): boolean => {
  const mode = getEnvString(env, 'MODE').toLowerCase();

  return env['DEV'] === true || mode === 'development' || mode === 'test';
};

export const isExplicitSameOriginApiMode = (env: FrontendEnv): boolean =>
  getEnvString(env, 'VITE_API_BASE_URL_MODE').toLowerCase() === sameOriginApiMode;

const isNonProductionFrontendBuild = (command: string, mode: string): boolean =>
  command !== 'build' || mode === 'development' || mode === 'test';

export const getDefaultFrontendBuildApiBaseUrlMode = (
  env: FrontendEnv,
  command: string,
  mode: string,
): string | undefined => {
  if (
    isNonProductionFrontendBuild(command, mode) ||
    getEnvString(env, 'VITE_API_BASE_URL_MODE') ||
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
  if (defaultMode) {
    env['VITE_API_BASE_URL_MODE'] = defaultMode;
  }

  if (isExplicitSameOriginApiMode(env)) {
    for (const key of frontendApiBaseUrlKeys) {
      delete env[key];
    }
  }

  return defaultMode !== undefined;
};

export const normalizeApiBaseUrl = (value: string): string => value.trim().replace(/\/$/u, '');

const requireAbsoluteHttpOrigin = (value: string, key: FrontendApiBaseUrlKey): string => {
  const normalized = value.trim();
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error(`${key} must be an absolute HTTP(S) origin.`);
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error(`${key} must be an absolute HTTP(S) origin without credentials, a path, query, or fragment.`);
  }

  return url.origin;
};

export const getApiBaseUrl = (env: FrontendEnv, key: FrontendApiBaseUrlKey): string => {
  if (isExplicitSameOriginApiMode(env)) {
    return '';
  }

  const configuredValue = normalizeApiBaseUrl(getEnvString(env, key));
  if (configuredValue) {
    return requireAbsoluteHttpOrigin(configuredValue, key);
  }

  if (isNonProductionFrontendEnv(env)) {
    return '';
  }

  throw new Error(
    `${key} is required for production frontend builds/runtime. ` +
      `Set ${frontendApiBaseUrlKeys.join(', ')} to explicit API origins, ` +
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

  const missing = keys.filter((key) => !normalizeApiBaseUrl(getEnvString(env, key)));
  if (missing.length > 0) {
    throw new Error(
      `Missing required production frontend API base URL env var(s): ${missing.join(', ')}. ` +
        `Set explicit API origins or set VITE_API_BASE_URL_MODE=${sameOriginApiMode} to opt into a same-origin API proxy.`,
    );
  }

  for (const key of keys) {
    requireAbsoluteHttpOrigin(getEnvString(env, key), key);
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
