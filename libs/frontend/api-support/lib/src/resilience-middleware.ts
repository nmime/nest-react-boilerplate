import type { Middleware } from "openapi-fetch";

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

export interface ApiResilienceMiddlewareOptions {
  eventHub?: ApiRuntimeEventHub;
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

export const createApiResilienceMiddleware = ({
  eventHub = apiRuntimeEvents,
  toastRules = defaultApiToastRules,
  toastRuntime = apiToastRuntime,
}: ApiResilienceMiddlewareOptions = {}): Middleware => ({
  async onResponse({ request, response }) {
    if (response.status < 400) {
      toastRuntime.showForApiResult(
        {
          endpoint: requestEndpoint(request),
          method: request.method,
          status: response.status,
        },
        toastRules,
      );

      return undefined;
    }

    const body = await readJsonBody(response);
    const normalized = normalizeApiError({
      body,
      endpoint: requestEndpoint(request),
      method: request.method,
      response,
    });

    if (normalized.kind === "server") {
      eventHub.emit({ type: "server-error", error: snapshotError(normalized) });
    }

    toastRuntime.showForApiResult(normalized, toastRules);

    return enrichJsonResponse(response, normalized);
  },
  onError({ error, request }) {
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
  },
});

export const createErrorNormalizationMiddleware = createApiResilienceMiddleware;
