import { ApiClientError, toOpenApiFetchOptions, type ApiClientRequestOptions } from './service-options';

export interface TelegramOidcAuthorizationInput {
  callbackURL: string;
  errorCallbackURL?: string;
}

export interface BetterAuthRedirectResponse {
  url: string;
  redirect: boolean;
}

export interface BetterAuthTelegramSessionResponse {
  status: 'authenticated';
  token: string;
  user: Record<string, unknown>;
  session: Record<string, unknown>;
  identity: {
    provider: 'telegram';
    channel: 'telegram_tma';
    providerSubject: string;
  };
}

const joinUrl = (baseUrl: string, path: string): string => `${baseUrl.replace(/\/$/u, '')}${path}`;

async function postJson<TResponse>(
  path: string,
  body: Record<string, unknown>,
  options: ApiClientRequestOptions,
): Promise<TResponse> {
  const normalized = toOpenApiFetchOptions(options);
  const headers = new Headers(normalized.headers);
  headers.set('content-type', 'application/json');
  const response = await normalized.fetch(joinUrl(normalized.baseUrl ?? globalThis.location.origin, path), {
    credentials: normalized.credentials ?? 'include',
    headers,
    method: 'POST',
    signal: normalized.signal,
    body: JSON.stringify(body),
  });
  const contentType = response.headers.get('content-type') ?? '';
  const responseBody: unknown = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    throw new ApiClientError(response.status, responseBody, response);
  }
  return responseBody as TResponse;
}

export const requestTelegramOidcAuthorization = (
  options: ApiClientRequestOptions,
  input: TelegramOidcAuthorizationInput,
): Promise<BetterAuthRedirectResponse> =>
  postJson(
    '/api/auth/sign-in/oauth2',
    {
      providerId: 'telegram',
      callbackURL: input.callbackURL,
      errorCallbackURL: input.errorCallbackURL ?? input.callbackURL,
      disableRedirect: true,
    },
    options,
  );

export const establishTelegramTmaBetterAuthSession = (
  options: ApiClientRequestOptions,
  initData: string,
): Promise<BetterAuthTelegramSessionResponse> => postJson('/api/auth/telegram/tma', { initData }, options);
