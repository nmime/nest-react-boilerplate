export type NormalizedApiErrorKind =
  "auth" | "client" | "network" | "server" | "unknown" | "validation";

export interface NormalizedValidationIssue {
  field?: string;
  message: string;
}

export interface NormalizedApiError {
  body?: unknown;
  code: string;
  detail?: string;
  endpoint?: string;
  id: string;
  kind: NormalizedApiErrorKind;
  message: string;
  method?: string;
  status: number | null;
  validation: NormalizedValidationIssue[];
}

export interface NormalizeApiErrorInput {
  body?: unknown;
  endpoint?: string;
  error?: unknown;
  method?: string;
  response?: Pick<Response, "status" | "statusText">;
}

export const FRONTEND_ERROR_KEY = "_frontendError";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringFrom = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const statusKind = (
  status: number | null,
  body: unknown,
): NormalizedApiErrorKind => {
  if (status === null) {
    return "network";
  }

  if (status === 401 || status === 403) {
    return "auth";
  }

  if (
    (status === 400 || status === 422) &&
    extractValidation(body).length > 0
  ) {
    return "validation";
  }

  if (status >= 500) {
    return "server";
  }

  if (status >= 400) {
    return "client";
  }

  return "unknown";
};

const extractCode = (
  status: number | null,
  body: unknown,
  fallbackKind: NormalizedApiErrorKind,
): string => {
  if (isRecord(body)) {
    const code =
      stringFrom(body["code"]) ??
      stringFrom(body["errorCode"]) ??
      stringFrom(body["name"]) ??
      stringFrom(body["type"]);

    if (code) {
      return code;
    }
  }

  if (status === null) {
    return fallbackKind === "network" ? "network.offline" : "network.error";
  }

  return `http.${status}`;
};

const extractMessage = (
  status: number | null,
  body: unknown,
  error: unknown,
  statusText?: string,
): string => {
  if (isRecord(body)) {
    const message =
      stringFrom(body["localizedDetail"]) ??
      stringFrom(body["detail"]) ??
      stringFrom(body["message"]) ??
      stringFrom(body["title"]) ??
      stringFrom(body["error"]);

    if (message) {
      return message;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (status === null) {
    return "Network connection failed.";
  }

  return statusText?.trim() || `Request failed with status ${status}.`;
};

const validationFromArray = (items: unknown[]): NormalizedValidationIssue[] =>
  items.flatMap((item) => {
    if (typeof item === "string") {
      return [{ message: item }];
    }

    if (!isRecord(item)) {
      return [];
    }

    const message =
      stringFrom(item["message"]) ??
      stringFrom(item["detail"]) ??
      stringFrom(item["error"]);

    if (!message) {
      return [];
    }

    return [
      {
        field: stringFrom(item["field"]) ?? stringFrom(item["property"]),
        message,
      },
    ];
  });

export const extractValidation = (
  body: unknown,
): NormalizedValidationIssue[] => {
  if (!isRecord(body)) {
    return [];
  }

  const errors = body["errors"];
  if (Array.isArray(errors)) {
    return validationFromArray(errors);
  }

  if (isRecord(errors)) {
    return Object.entries(errors).flatMap(([field, value]) => {
      if (Array.isArray(value)) {
        return value
          .map(stringFrom)
          .filter((message): message is string => Boolean(message))
          .map((message) => ({ field, message }));
      }

      const message = stringFrom(value);
      return message ? [{ field, message }] : [];
    });
  }

  return [];
};

export const normalizeApiError = ({
  body,
  endpoint,
  error,
  method,
  response,
}: NormalizeApiErrorInput): NormalizedApiError => {
  const status = response?.status ?? null;
  const kind = statusKind(status, body);
  const code = extractCode(status, body, kind);
  const message = extractMessage(status, body, error, response?.statusText);
  const normalizedMethod = method?.toUpperCase();
  const id = [normalizedMethod, endpoint, status ?? "network", code]
    .filter(Boolean)
    .join(":");

  return {
    body,
    code,
    detail: isRecord(body) ? stringFrom(body["detail"]) : undefined,
    endpoint,
    id,
    kind,
    message,
    method: normalizedMethod,
    status,
    validation: extractValidation(body),
  };
};

export const isNetworkFailure = (error: unknown): boolean =>
  error instanceof TypeError ||
  (error instanceof Error &&
    /network|fetch|offline|failed to fetch/iu.test(error.message));

export const readJsonBody = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("json")) {
    return undefined;
  }

  return response
    .clone()
    .json()
    .catch(() => undefined);
};

export const enrichJsonResponse = async (
  response: Response,
  error: NormalizedApiError,
): Promise<Response> => {
  const body = await readJsonBody(response);
  const enrichedBody = isRecord(body)
    ? { ...body, [FRONTEND_ERROR_KEY]: error }
    : { [FRONTEND_ERROR_KEY]: error };
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(enrichedBody), {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};
