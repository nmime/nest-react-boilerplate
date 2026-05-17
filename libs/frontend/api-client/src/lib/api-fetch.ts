import { fallbackLocale, normalizeLocale } from "@app/common/i18n";

export class ApiFetchResponseError extends Error {
  readonly name = "ApiFetchResponseError";

  constructor(
    readonly status: number,
    readonly responseBody?: unknown,
  ) {
    super(`API request failed with ${status}.`);
  }
}

export interface ApiFetchOptions<TBody = unknown> extends Omit<
  RequestInit,
  "body" | "headers"
> {
  baseUrl?: string;
  body?: TBody;
  fetchImpl?: typeof fetch;
  headers?: HeadersInit;
  locale?: string | null;
}

export interface ApiResponseEnvelope<TData> {
  data?: TData;
}

export const normalizeApiBaseUrl = (value?: string): string =>
  (value?.trim() ?? "").replace(/\/$/u, "");

const isBodyInit = (value: unknown): value is BodyInit =>
  typeof value === "string" ||
  value instanceof URLSearchParams ||
  (typeof FormData !== "undefined" && value instanceof FormData) ||
  (typeof Blob !== "undefined" && value instanceof Blob) ||
  value instanceof ArrayBuffer ||
  ArrayBuffer.isView(value) ||
  (typeof ReadableStream !== "undefined" && value instanceof ReadableStream);

const parseJsonBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) {
    return undefined;
  }

  return response.json();
};

export const getRawFetch = (fetchImpl?: typeof fetch): typeof fetch => {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof globalThis.fetch === "function") {
    return (input, init) => globalThis.fetch(input, init);
  }

  throw new Error("Global fetch is not available.");
};

export async function apiFetch<TResponse, TBody = unknown>(
  path: string,
  {
    baseUrl,
    body,
    fetchImpl,
    headers,
    locale,
    ...init
  }: ApiFetchOptions<TBody> = {},
): Promise<TResponse> {
  const rawFetch = getRawFetch(fetchImpl);
  const requestHeaders = new Headers(headers);
  const resolvedLocale = normalizeLocale(locale) ?? fallbackLocale;

  if (!requestHeaders.has("Accept")) {
    requestHeaders.set("Accept", "application/json");
  }
  if (!requestHeaders.has("Accept-Language")) {
    requestHeaders.set("Accept-Language", resolvedLocale);
  }

  let requestBody: BodyInit | undefined;
  if (body !== undefined) {
    requestBody = isBodyInit(body) ? body : JSON.stringify(body);
  }

  if (
    body !== undefined &&
    !isBodyInit(body) &&
    !requestHeaders.has("content-type")
  ) {
    requestHeaders.set("content-type", "application/json");
  }

  const response = await rawFetch(`${normalizeApiBaseUrl(baseUrl)}${path}`, {
    ...init,
    body: requestBody,
    headers: requestHeaders,
  });

  let responseBody: unknown;
  try {
    responseBody = await parseJsonBody(response);
  } catch (error) {
    if (response.ok) {
      throw error;
    }
  }

  if (!response.ok) {
    throw new ApiFetchResponseError(response.status, responseBody);
  }

  return responseBody as TResponse;
}
