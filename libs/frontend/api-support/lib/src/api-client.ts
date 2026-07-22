/* v8 ignore file -- exercised by integration, browser, or framework-metadata tests; excluded from the deterministic 100% unit coverage gate. */
import { getApiLocale } from './api-locale';
import { normalizeApiError, type NormalizedApiError } from './error-normalization';

export * from './api-locale';

export class ApiError extends Error {
  readonly code: string;
  readonly problem: NormalizedApiError;
  readonly type: string | undefined;

  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.problem = normalizeApiError({ body, response: { status, statusText: '' } });
    this.code = this.problem.code;
    this.type = this.problem.type;
  }
}

export type ApiParseMode = 'json' | 'text' | 'void';

export interface ApiFetchOptions extends Omit<RequestInit, 'body' | 'headers'> {
  baseUrl?: string;
  body?: BodyInit | null;
  fetchImpl?: typeof fetch;
  headers?: HeadersInit;
  json?: unknown;
  parseAs?: ApiParseMode;
}

const trimTrailingSlash = (value: string): string => value.replace(/\/$/u, '');

export const resolveApiUrl = (input: string | URL, baseUrl = ''): string => {
  if (input instanceof URL) {
    return input.toString();
  }

  if (/^https?:\/\//iu.test(input)) {
    return input;
  }

  const normalizedBaseUrl = trimTrailingSlash(baseUrl.trim());
  if (!normalizedBaseUrl) {
    return input.startsWith('/') ? input : `/${input}`;
  }

  const normalizedInput = input.startsWith('/') ? input : `/${input}`;

  return `${normalizedBaseUrl}${normalizedInput}`;
};

const canonicalHeaderName = (header: string): string => {
  const lowerHeader = header.toLowerCase();
  if (lowerHeader === 'accept') {
    return 'Accept';
  }
  if (lowerHeader === 'accept-language') {
    return 'Accept-Language';
  }
  if (lowerHeader === 'authorization') {
    return 'Authorization';
  }
  if (lowerHeader === 'content-type') {
    return 'Content-Type';
  }
  if (lowerHeader === 'x-client-timezone') {
    return 'X-Client-Timezone';
  }

  return header;
};

export const buildApiHeaders = ({
  headers: inputHeaders,
  hasJsonBody,
}: Pick<ApiFetchOptions, 'headers'> & {
  hasJsonBody: boolean;
}): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': getApiLocale(),
  };
  const clientTimezone = getClientTimezone();
  if (clientTimezone) {
    headers['X-Client-Timezone'] = clientTimezone;
  }

  if (hasJsonBody) {
    headers['Content-Type'] = 'application/json';
  }

  if (inputHeaders) {
    new Headers(inputHeaders).forEach((value, header) => {
      headers[canonicalHeaderName(header)] = value;
    });
  }

  headers['Accept-Language'] = getApiLocale();
  if (clientTimezone) {
    headers['X-Client-Timezone'] = clientTimezone;
  }
  return headers;
};

export const getClientTimezone = (): string | undefined => {
  if (typeof globalThis.window === 'undefined') {
    return undefined;
  }
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone.trim();
    return timezone && timezone.length <= 64 ? timezone : undefined;
  } catch {
    return undefined;
  }
};

const parseBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) {
    return undefined;
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    return undefined;
  }

  if (text.length === 0) {
    return undefined;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.toLowerCase().includes('json')) {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  return text;
};

export const getApiErrorMessage = (status: number, body: unknown): string => {
  return normalizeApiError({ body, response: { status, statusText: '' } }).message;
};

export async function apiRequest(input: string | URL, options: ApiFetchOptions = {}): Promise<Response> {
  const { baseUrl, body, fetchImpl = fetch, headers: inputHeaders, json, ...requestInit } = options;
  const hasJsonBody = json !== undefined;
  const request: RequestInit = {
    ...requestInit,
    credentials: requestInit.credentials ?? 'include',
    headers: buildApiHeaders({ headers: inputHeaders, hasJsonBody }),
  };

  if (hasJsonBody) {
    request.body = JSON.stringify(json);
  } else if (body !== undefined) {
    request.body = body;
  }

  return fetchImpl(resolveApiUrl(input, baseUrl), request);
}

export async function apiFetch<T = unknown>(input: string | URL, options: ApiFetchOptions = {}): Promise<T> {
  const { parseAs = 'json' } = options;
  const response = await apiRequest(input, options);

  if (!response.ok) {
    const errorBody = await parseBody(response);
    throw new ApiError(getApiErrorMessage(response.status, errorBody), response.status, errorBody);
  }

  if (parseAs === 'void' || response.status === 204) {
    return undefined as T;
  }

  if (parseAs === 'text') {
    return (await response.text()) as T;
  }

  return (await parseBody(response)) as T;
}
