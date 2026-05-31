import { randomUUID } from "node:crypto";
import { unknownToError } from "@app/common/shared";
import { ApiResponseKind, HttpMethod } from "../enum";
import { getHttpApiFailureResponseKind } from "./util";
import type {
  HttpClientConfig,
  HttpHeaders,
  HttpMethodRequestConfig,
  HttpRequestConfig,
  HttpResponse,
  QueryValue,
} from "./type";

const JsonContentType = "application/json";

function appendQuery(url: URL, query?: Record<string, QueryValue>): URL {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function buildUrl(baseUrl: string | undefined, path: string): string {
  if (/^https?:\/\//u.test(path)) {
    return path;
  }

  if (!baseUrl) {
    return path;
  }

  return new URL(
    path.replace(/^\//u, ""),
    `${baseUrl.replace(/\/?$/u, "/")}`,
  ).toString();
}

// eslint-disable-next-line sonarjs/function-return-type -- Fetch uses BodyInit | undefined for optional request bodies.
function encodeBody(data: unknown, headers: HttpHeaders): BodyInit | undefined {
  if (data === undefined) {
    return undefined;
  }

  if (
    typeof data === "string" ||
    data instanceof FormData ||
    data instanceof URLSearchParams ||
    data instanceof Blob ||
    data instanceof ArrayBuffer
  ) {
    return data;
  }

  const hasContentType = Object.keys(headers).some(
    (key) => key.toLowerCase() === "content-type",
  );
  if (!hasContentType) {
    headers["content-type"] = JsonContentType;
  }

  return JSON.stringify(data);
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes(JsonContentType)) {
    return await response.json();
  }

  return await response.text();
}

export class HttpClient {
  private baseUrl?: string;
  private headers: HttpHeaders;
  private timeoutMs: number;
  private readonly logger?: HttpClientConfig["logger"];
  private readonly fetcher: typeof fetch;

  constructor(config: HttpClientConfig = {}) {
    this.baseUrl = config.baseUrl;
    this.headers = config.headers ?? {};
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.logger = config.logger;
    this.fetcher = config.fetch ?? fetch;
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl;
  }

  setHeaders(headers: HttpHeaders): void {
    this.headers = headers;
  }

  async request<TSuccess = unknown, TError = unknown, TBody = unknown>(
    config: HttpRequestConfig<TBody>,
  ): Promise<HttpResponse<TSuccess, TError>> {
    const requestId = config.requestId ?? randomUUID();
    const headers = { ...this.headers, ...config.headers };
    const url = appendQuery(
      new URL(buildUrl(this.baseUrl, config.url), this.baseUrl),
      config.query,
    ).toString();
    const timeoutMs = config.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await this.fetcher(url, {
        method: config.method ?? HttpMethod.GET,
        headers,
        body: encodeBody(config.data, headers),
        signal: controller.signal,
      });
      const data = await parseBody(response);
      this.logger?.debug?.("HTTP client response", {
        durationMs: Date.now() - startedAt,
        method: config.method ?? HttpMethod.GET,
        requestId,
        status: response.status,
        url,
      });

      if (response.ok) {
        return {
          ok: true,
          kind: ApiResponseKind.Ok,
          status: response.status,
          headers: response.headers,
          data: data as TSuccess,
          requestId,
        };
      }

      return {
        ok: false,
        kind: getHttpApiFailureResponseKind(response.status) as Exclude<
          ApiResponseKind,
          ApiResponseKind.Ok
        >,
        status: response.status,
        headers: response.headers,
        data: data as TError,
        requestId,
      };
    } catch (caught) {
      const error = unknownToError(caught);
      const kind =
        error.name === "AbortError"
          ? ApiResponseKind.Timeout
          : ApiResponseKind.NetworkError;
      this.logger?.error("HTTP client request failed", {
        error: error.message,
        method: config.method ?? HttpMethod.GET,
        requestId,
        url,
      });

      return {
        ok: false,
        kind,
        error,
        requestId,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  get<TSuccess = unknown, TError = unknown>(
    url: string,
    config: Omit<HttpRequestConfig, "method" | "url"> = {},
  ): Promise<HttpResponse<TSuccess, TError>> {
    return this.request<TSuccess, TError>({
      ...config,
      method: HttpMethod.GET,
      url,
    });
  }

  post<TSuccess = unknown, TError = unknown, TBody = unknown>(
    url: string,
    data?: TBody,
    config: HttpMethodRequestConfig<TBody> = {},
  ): Promise<HttpResponse<TSuccess, TError>> {
    return this.request<TSuccess, TError, TBody>({
      ...config,
      data,
      method: HttpMethod.POST,
      url,
    });
  }

  put<TSuccess = unknown, TError = unknown, TBody = unknown>(
    url: string,
    data?: TBody,
    config: HttpMethodRequestConfig<TBody> = {},
  ): Promise<HttpResponse<TSuccess, TError>> {
    return this.request<TSuccess, TError, TBody>({
      ...config,
      data,
      method: HttpMethod.PUT,
      url,
    });
  }

  patch<TSuccess = unknown, TError = unknown, TBody = unknown>(
    url: string,
    data?: TBody,
    config: HttpMethodRequestConfig<TBody> = {},
  ): Promise<HttpResponse<TSuccess, TError>> {
    return this.request<TSuccess, TError, TBody>({
      ...config,
      data,
      method: HttpMethod.PATCH,
      url,
    });
  }

  delete<TSuccess = unknown, TError = unknown>(
    url: string,
    config: Omit<HttpRequestConfig, "method" | "url"> = {},
  ): Promise<HttpResponse<TSuccess, TError>> {
    return this.request<TSuccess, TError>({
      ...config,
      method: HttpMethod.DELETE,
      url,
    });
  }
}
