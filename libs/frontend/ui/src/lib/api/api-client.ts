import { fallbackLocale, translate, type Locale } from "@app/common/i18n";

let currentApiLocale: Locale = fallbackLocale;
let apiLocaleGetter: () => Locale = () => currentApiLocale;

export interface ConfigureApiLocaleOptions {
  getLocale?: () => Locale;
  locale?: Locale;
}

export const setApiLocale = (locale: Locale): void => {
  currentApiLocale = locale;
};

export const configureApiLocale = ({
  getLocale,
  locale,
}: ConfigureApiLocaleOptions): void => {
  if (locale) {
    setApiLocale(locale);
  }
  apiLocaleGetter = getLocale ?? (() => currentApiLocale);
};

export const getApiLocale = (): Locale => apiLocaleGetter();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiParseMode = "json" | "text" | "void";

export interface ApiFetchOptions extends Omit<RequestInit, "body" | "headers"> {
  authToken?: string | null;
  baseUrl?: string;
  body?: BodyInit | null;
  fetchImpl?: typeof fetch;
  headers?: HeadersInit;
  json?: unknown;
  parseAs?: ApiParseMode;
}

const trimTrailingSlash = (value: string): string => value.replace(/\/$/u, "");

export const resolveApiUrl = (input: string | URL, baseUrl = ""): string => {
  if (input instanceof URL) {
    return input.toString();
  }

  if (/^https?:\/\//iu.test(input)) {
    return input;
  }

  const normalizedBaseUrl = trimTrailingSlash(baseUrl.trim());
  if (!normalizedBaseUrl) {
    return input.startsWith("/") ? input : `/${input}`;
  }

  const normalizedInput = input.startsWith("/") ? input : `/${input}`;

  return `${normalizedBaseUrl}${normalizedInput}`;
};

const canonicalHeaderName = (header: string): string => {
  const lowerHeader = header.toLowerCase();
  if (lowerHeader === "accept") {
    return "Accept";
  }
  if (lowerHeader === "accept-language") {
    return "Accept-Language";
  }
  if (lowerHeader === "authorization") {
    return "Authorization";
  }
  if (lowerHeader === "content-type") {
    return "Content-Type";
  }

  return header;
};

export const buildApiHeaders = ({
  authToken,
  headers: inputHeaders,
  hasJsonBody,
}: Pick<ApiFetchOptions, "authToken" | "headers"> & {
  hasJsonBody: boolean;
}): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Language": getApiLocale(),
  };

  if (authToken?.trim()) {
    headers.Authorization = `Bearer ${authToken.trim()}`;
  }
  if (hasJsonBody) {
    headers["Content-Type"] = "application/json";
  }

  if (inputHeaders) {
    new Headers(inputHeaders).forEach((value, header) => {
      headers[canonicalHeaderName(header)] = value;
    });
  }

  headers["Accept-Language"] = getApiLocale();
  return headers;
};

const parseBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) {
    return undefined;
  }

  let text = "";
  try {
    text = await response.text();
  } catch {
    return undefined;
  }

  if (text.length === 0) {
    return undefined;
  }

  const contentType = response.headers?.get?.("content-type") ?? "";
  if (contentType.toLowerCase().includes("json")) {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  return text;
};

export const getApiErrorMessage = (status: number, body: unknown): string => {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const message =
      record["detail"] ??
      record["message"] ??
      record["title"] ??
      record["error"];
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return translate("errors.api.requestFailed", {
    locale: getApiLocale(),
    params: { status },
  });
};

export async function apiRequest(
  input: string | URL,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const {
    authToken,
    baseUrl,
    body,
    fetchImpl = fetch,
    headers: inputHeaders,
    json,
    ...requestInit
  } = options;
  const hasJsonBody = json !== undefined;
  const request: RequestInit = {
    ...requestInit,
    credentials: requestInit.credentials ?? "include",
    headers: buildApiHeaders({ authToken, headers: inputHeaders, hasJsonBody }),
  };

  if (hasJsonBody) {
    request.body = JSON.stringify(json);
  } else if (body !== undefined) {
    request.body = body;
  }

  return fetchImpl(resolveApiUrl(input, baseUrl), request);
}

export async function apiFetch<T = unknown>(
  input: string | URL,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { parseAs = "json" } = options;
  const response = await apiRequest(input, options);

  if (!response.ok) {
    const errorBody = await parseBody(response);
    throw new ApiError(
      getApiErrorMessage(response.status, errorBody),
      response.status,
      errorBody,
    );
  }

  if (parseAs === "void" || response.status === 204) {
    return undefined as T;
  }

  if (parseAs === "text") {
    return (await response.text()) as T;
  }

  return (await parseBody(response)) as T;
}
