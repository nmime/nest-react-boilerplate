import type { ApiClientRuntimeConfig } from '@app/frontend-api-client';

export interface MobileApiEnvironment {
  readonly baseUrl?: string;
  readonly adminUrl?: string;
  readonly authUrl?: string;
  readonly userUrl?: string;
}

function apiUrl(value: string | undefined, web: boolean): string {
  const configured = value?.trim() ?? '';
  if (web && (!configured || configured === 'same-origin')) return '';
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('Mobile API configuration requires absolute HTTP(S) service URLs.');
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('Mobile API service URLs cannot contain credentials, queries, or fragments.');
  }
  return parsed.href.replace(/\/$/u, '');
}

/** URL configuration contains public origins only; session transport is provided by the product. */
export function resolveMobileApiConfig(
  platform: string,
  environment: MobileApiEnvironment,
  sessionFetch?: typeof fetch,
): ApiClientRuntimeConfig | null {
  const web = platform === 'web';
  if (!web && Object.values(environment).every((value) => !value?.trim())) return null;
  return {
    baseUrls: {
      admin: apiUrl(environment.adminUrl ?? environment.baseUrl, web),
      auth: apiUrl(environment.authUrl ?? environment.baseUrl, web),
      user: apiUrl(environment.userUrl ?? environment.baseUrl, web),
    },
    credentials: web ? 'include' : 'omit',
    fetchImpl: sessionFetch,
  };
}

/** Expo inlines only statically written dot-property references. Never add public credentials. */
export function readMobileApiEnvironment(): MobileApiEnvironment {
  return {
    baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    adminUrl: process.env.EXPO_PUBLIC_ADMIN_API_URL,
    authUrl: process.env.EXPO_PUBLIC_AUTH_API_URL,
    userUrl: process.env.EXPO_PUBLIC_USER_API_URL,
  };
}
