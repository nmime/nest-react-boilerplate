import {
  buildApiHeaders,
  getApiErrorMessage,
  type ApiFetchOptions,
} from "@app/frontend-api-support";

export type ApiClientRequestOptions = Omit<
  ApiFetchOptions,
  "body" | "fetchImpl" | "json" | "method" | "parseAs"
> & {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/$/u, "");

const getDefaultOpenApiBaseUrl = (): string => {
  if (typeof globalThis.location?.origin === "string") {
    return globalThis.location.origin;
  }

  return "http://localhost";
};

const normalizeOpenApiBaseUrl = (baseUrl?: string): string => {
  const normalizedBaseUrl = trimTrailingSlash(baseUrl?.trim() ?? "");
  if (!normalizedBaseUrl) {
    return getDefaultOpenApiBaseUrl();
  }

  if (normalizedBaseUrl.startsWith("/")) {
    return `${getDefaultOpenApiBaseUrl()}${normalizedBaseUrl}`;
  }

  return normalizedBaseUrl;
};

export const toOpenApiFetchOptions = (
  options: ApiClientRequestOptions = {},
): Omit<ApiClientRequestOptions, "authToken" | "fetchImpl"> & {
  fetch: typeof fetch;
} => {
  const { authToken, baseUrl, fetchImpl, headers, ...requestOptions } = options;

  return {
    ...requestOptions,
    baseUrl: normalizeOpenApiBaseUrl(baseUrl),
    credentials: requestOptions.credentials ?? "include",
    fetch: fetchImpl ?? globalThis.fetch,
    headers: buildApiHeaders({ authToken, headers, hasJsonBody: false }),
  };
};

type AwaitedFunctionReturn<T> = T extends (
  ...args: infer _TArgs
) => Promise<infer TResult>
  ? Awaited<TResult>
  : never;

export type OpenApiData<T> = NonNullable<
  Extract<AwaitedFunctionReturn<T>, { data: unknown }>["data"]
>;

export type OpenApiError<T> = NonNullable<
  Extract<AwaitedFunctionReturn<T>, { error: unknown }>["error"]
>;

export type EnvelopeData<T> = T extends { data: infer TData }
  ? NonNullable<TData>
  : NonNullable<T>;

export class ApiClientError<TError = unknown> extends Error {
  constructor(
    readonly status: number,
    readonly body: TError | undefined,
    readonly response: Response,
  ) {
    super(getApiErrorMessage(status, body));
    this.name = "ApiClientError";
  }
}

export const isApiClientError = <TError = unknown>(
  value: unknown,
): value is ApiClientError<TError> => value instanceof ApiClientError;

export const unwrapEnvelopeData = <TData>(data: TData): EnvelopeData<TData> => {
  if (data && typeof data === "object" && "data" in data) {
    return (data as { data: EnvelopeData<TData> }).data;
  }

  return data as EnvelopeData<TData>;
};

export const throwOnOpenApiError = async <TData, TError>(
  resultPromise: Promise<
    | { data: TData; error?: never; response: Response }
    | { data?: never; error: TError; response: Response }
  >,
): Promise<NonNullable<TData>> => {
  const result = await resultPromise;
  if (result.error !== undefined) {
    throw new ApiClientError<TError>(
      result.response.status,
      result.error,
      result.response,
    );
  }

  return result.data as NonNullable<TData>;
};

export const throwOnOpenApiErrorData = async <TData, TError>(
  resultPromise: Promise<
    | { data: TData; error?: never; response: Response }
    | { data?: never; error: TError; response: Response }
  >,
): Promise<EnvelopeData<TData>> =>
  unwrapEnvelopeData(await throwOnOpenApiError(resultPromise));
