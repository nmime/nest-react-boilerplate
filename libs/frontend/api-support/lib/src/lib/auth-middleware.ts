import type { Middleware } from "openapi-fetch";

import { normalizeApiError, readJsonBody } from "./error-normalization";
import { apiRuntimeEvents, type ApiRuntimeEventHub } from "./runtime-events";

export interface AuthRefreshResult {
  accessToken: string;
}

export interface ApiAuthMiddlewareOptions {
  clearAuth: () => Promise<void> | void;
  eventHub?: ApiRuntimeEventHub;
  fetchImpl?: typeof fetch;
  getAccessToken: () =>
    Promise<string | null | undefined> | string | null | undefined;
  redirectTo?: string;
  refreshAccessToken: () => Promise<
    AuthRefreshResult | string | null | undefined
  >;
  shouldHandle401?: (request: Request) => boolean;
}

const requestEndpoint = (request: Request): string => {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
};

const toAccessToken = (
  result: AuthRefreshResult | string | null | undefined,
): string | null => {
  if (typeof result === "string") {
    return result.trim() || null;
  }

  return result?.accessToken.trim() || null;
};

const createSingleFlightRefresh = (
  refreshAccessToken: ApiAuthMiddlewareOptions["refreshAccessToken"],
): (() => Promise<string | null>) => {
  let refreshPromise: Promise<string | null> | null = null;

  return () => {
    if (!refreshPromise) {
      refreshPromise = Promise.resolve()
        .then(refreshAccessToken)
        .then(toAccessToken)
        .catch(() => null)
        .finally(() => {
          refreshPromise = null;
        });
    }

    return refreshPromise;
  };
};

export const createAuthRefreshMiddleware = ({
  clearAuth,
  eventHub = apiRuntimeEvents,
  fetchImpl = globalThis.fetch,
  getAccessToken,
  redirectTo = "/login",
  refreshAccessToken,
  shouldHandle401 = () => true,
}: ApiAuthMiddlewareOptions): Middleware => {
  const refreshOnce = createSingleFlightRefresh(refreshAccessToken);

  const clearAndEmit = async (
    request: Request,
    response: Response,
    reason: "refresh-failed" | "retry-rejected",
  ): Promise<void> => {
    const body = await readJsonBody(response);
    const normalized = normalizeApiError({
      body,
      endpoint: requestEndpoint(request),
      method: request.method,
      response,
    });

    await clearAuth();
    eventHub.emit({
      type: "auth-required",
      error: {
        code: normalized.code,
        endpoint: normalized.endpoint,
        id: normalized.id,
        kind: normalized.kind,
        message: normalized.message,
        method: normalized.method,
        status: normalized.status,
      },
      reason,
      redirectTo,
    });
  };

  return {
    async onRequest({ request }) {
      const token = await getAccessToken();

      if (token?.trim()) {
        request.headers.set("Authorization", `Bearer ${token.trim()}`);
      }

      return request;
    },
    async onResponse({ request, response }) {
      if (response.status !== 401 || !shouldHandle401(request)) {
        return undefined;
      }

      const token = await refreshOnce();

      if (!token) {
        await clearAndEmit(request, response, "refresh-failed");
        return undefined;
      }

      const retryRequest = request.clone();
      retryRequest.headers.set("Authorization", `Bearer ${token}`);
      const retryResponse = await fetchImpl(retryRequest);

      if (retryResponse.status === 401) {
        await clearAndEmit(request, retryResponse, "retry-rejected");
      }

      return retryResponse;
    },
  };
};

export interface AuthRefreshFetchOptions {
  baseFetch?: typeof fetch;
  clearAuth: () => Promise<void> | void;
  refreshAccessToken: ApiAuthMiddlewareOptions["refreshAccessToken"];
  shouldHandle401?: (request: Request) => boolean;
}

const hasAuthorizationHeader = (request: Request): boolean =>
  Boolean(request.headers.get("Authorization")?.trim());

/**
 * Fetch wrapper variant of the auth-refresh middleware for clients that
 * inject `fetchImpl` instead of registering openapi-fetch middleware. It
 * performs the same single-flight refresh + one retry on 401, but leaves
 * `auth-required` event emission to a downstream runtime fetch so the
 * failure surfaces exactly once.
 */
export const createAuthRefreshFetch = ({
  baseFetch = globalThis.fetch.bind(globalThis),
  clearAuth,
  refreshAccessToken,
  shouldHandle401 = hasAuthorizationHeader,
}: AuthRefreshFetchOptions): typeof fetch => {
  const refreshOnce = createSingleFlightRefresh(refreshAccessToken);

  return async (input, init) => {
    const request = new Request(input, init);
    const retryable = request.clone();
    const response = await baseFetch(request);

    if (response.status !== 401 || !shouldHandle401(retryable)) {
      return response;
    }

    const token = await refreshOnce();

    if (!token) {
      await clearAuth();
      return response;
    }

    retryable.headers.set("Authorization", `Bearer ${token}`);
    const retryResponse = await baseFetch(retryable);

    if (retryResponse.status === 401) {
      await clearAuth();
    }

    return retryResponse;
  };
};
