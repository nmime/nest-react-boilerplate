import {
  getFrontendRuntimeConfig,
  getRequiredApiBaseUrl,
  resolveFeatureFlag,
  type FrontendEnv,
} from '@app/frontend-api-support';

export const getFrontendEnv = (): FrontendEnv => import.meta.env;

export const getAuthApiBaseUrl = (): string => getRequiredApiBaseUrl(getFrontendEnv(), 'VITE_AUTH_API_BASE_URL');

export const getUserApiBaseUrl = (): string => getRequiredApiBaseUrl(getFrontendEnv(), 'VITE_USER_API_BASE_URL');

/**
 * Telegram login is deployment-configurable at runtime: the container writes
 * `runtime-config.js` from `TELEGRAM_AUTH_ENABLED` at start, so the same image can
 * enable it per environment. The Vite build value stays as the local-dev default.
 */
export const isTelegramAuthEnabled = (): boolean =>
  resolveFeatureFlag(getFrontendRuntimeConfig()['telegramAuthEnabled'], getFrontendEnv()['VITE_TELEGRAM_AUTH_ENABLED']);
