import { apiFetch, type ApiFetchOptions } from "@app/frontend-ui";

export type ApiClientRequestOptions = Omit<
  ApiFetchOptions,
  "body" | "json" | "method" | "parseAs"
> & {
  signal?: AbortSignal;
};

type ApiClientRequestConfig = {
  url: string;
  method: string;
  params?: Record<string, unknown>;
  data?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
};

const getQueryValue = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
};

const appendQueryValue = (
  search: URLSearchParams,
  key: string,
  value: unknown,
): void => {
  const queryValue = getQueryValue(value);
  if (queryValue !== undefined) search.append(key, queryValue);
};

const appendQuery = (url: string, params?: Record<string, unknown>): string => {
  if (!params) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach((item) => appendQueryValue(search, key, item));
    } else {
      appendQueryValue(search, key, value);
    }
  }

  const query = search.toString();
  if (!query) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
};

const mergeHeaders = (
  generatedHeaders?: HeadersInit,
  requestHeaders?: HeadersInit,
): HeadersInit | undefined => {
  if (!generatedHeaders && !requestHeaders) return undefined;

  const headers = new Headers(generatedHeaders);
  if (requestHeaders) {
    new Headers(requestHeaders).forEach((value, key) =>
      headers.set(key, value),
    );
  }
  return headers;
};

export const apiClientMutator = async <TData>(
  config: ApiClientRequestConfig,
  options: ApiClientRequestOptions = {},
): Promise<TData> => {
  const { data, headers, method, params, signal, url } = config;
  return apiFetch<TData>(appendQuery(url, params), {
    ...options,
    headers: mergeHeaders(headers, options.headers),
    json: data,
    method,
    signal: options.signal ?? signal,
  });
};
