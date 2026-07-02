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

export const createAuthRefreshMiddleware = ({
  clearAuth,
  eventHub = apiRuntimeEvents,
  fetchImpl = globalThis.fetch,
  getAccessToken,
  redirectTo = "/login",
  refreshAccessToken,
  shouldHandle401 = () => true,
}: ApiAuthMiddlewareOptions): Middleware => {
  let refreshPromise: Promise<string | null> | null = null;

  const refreshOnce = (): Promise<string | null> => {
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
