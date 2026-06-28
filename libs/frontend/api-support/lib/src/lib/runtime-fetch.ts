import {
  enrichJsonResponse,
  normalizeApiError,
  readJsonBody,
  type NormalizedApiError,
} from "./error-normalization";
import { apiRuntimeEvents, type ApiRuntimeEventHub } from "./runtime-events";
import {
  apiToastRuntime,
  defaultApiToastRules,
  type ApiToastRule,
  type ApiToastRuntime,
} from "./toast-runtime";

export interface ApiRuntimeFetchOptions {
  baseFetch?: typeof fetch;
  emitMissingTokenAuthRequired?: boolean;
  eventHub?: ApiRuntimeEventHub;
  redirectTo?: string;
  toastRules?: readonly ApiToastRule[];
  toastRuntime?: ApiToastRuntime;
}

const requestEndpoint = (request: Request): string => {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
};

const snapshotError = (error: NormalizedApiError) => ({
  code: error.code,
  endpoint: error.endpoint,
  id: error.id,
  kind: error.kind,
  message: error.message,
  method: error.method,
  status: error.status,
});

const hasAuthorization = (request: Request): boolean =>
  Boolean(request.headers.get("Authorization")?.trim());

const toRequest = (input: RequestInfo | URL, init?: RequestInit): Request =>
  new Request(input, init);

export const emitBrowserOfflineEvent = (
  eventHub: ApiRuntimeEventHub = apiRuntimeEvents,
): void => {
  eventHub.emit({
    type: "network-offline",
    error: {
      code: "network.offline",
      id: "browser:navigator:offline:network.offline",
      kind: "network",
      message: "Network connection is offline.",
      status: null,
    },
  });
};

export const createApiRuntimeFetch =
  ({
    baseFetch = globalThis.fetch.bind(globalThis),
    emitMissingTokenAuthRequired = false,
    eventHub = apiRuntimeEvents,
    redirectTo = "/auth",
    toastRules = defaultApiToastRules,
    toastRuntime = apiToastRuntime,
  }: ApiRuntimeFetchOptions = {}): typeof fetch =>
  async (input, init) => {
    const request = toRequest(input, init);

    try {
      const response = await baseFetch(request);

      if (response.status < 400) {
        toastRuntime.showForApiResult(
          {
            endpoint: requestEndpoint(request),
            method: request.method,
            status: response.status,
          },
          toastRules,
        );

        return response;
      }

      const body = await readJsonBody(response);
      const normalized = normalizeApiError({
        body,
        endpoint: requestEndpoint(request),
        method: request.method,
        response,
      });

      if (normalized.kind === "server") {
        eventHub.emit({
          type: "server-error",
          error: snapshotError(normalized),
        });
      }

      const requestHasAuthorization = hasAuthorization(request);
      if (
        response.status === 401 &&
        (requestHasAuthorization || emitMissingTokenAuthRequired)
      ) {
        eventHub.emit({
          type: "auth-required",
          error: snapshotError(normalized),
          reason: requestHasAuthorization ? "refresh-failed" : "missing-token",
          redirectTo,
        });
      }

      toastRuntime.showForApiResult(normalized, toastRules);

      return enrichJsonResponse(response, normalized);
    } catch (error) {
      const normalized = normalizeApiError({
        endpoint: requestEndpoint(request),
        error,
        method: request.method,
      });

      eventHub.emit({
        type: "network-offline",
        error: snapshotError(normalized),
      });
      toastRuntime.showForApiResult(normalized, toastRules);

      throw error;
    }
  };
