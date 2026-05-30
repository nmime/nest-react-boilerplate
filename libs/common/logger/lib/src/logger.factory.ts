import { randomUUID } from "node:crypto";
import {
  ConsoleLogger,
  type LoggerService,
  type LogLevel,
} from "@nestjs/common";

export const ProtectedLoggerFields = [
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "token",
  "signature",
  "x-api-key",
  "api-key",
  "api_key",
  "apikey",
  "access_key",
  "secret",
] as const;

const RedactedValue = "[redacted]";

export interface RequestLogLike {
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  path?: string;
  url?: string;
}

export interface ResponseLogLike {
  statusCode?: number;
  on(event: "finish", listener: () => void): unknown;
  setHeader(name: string, value: string): unknown;
}

export type RequestLoggerMiddleware = (
  request: RequestLogLike,
  response: ResponseLogLike,
  next: () => void,
) => void;

export interface CommonLoggerFactoryParams {
  name: string;
  levels?: LogLevel[];
  requestIdHeader?: string;
}

function getHeader(request: RequestLogLike, name: string): string | undefined {
  const value =
    request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function isProtectedField(key: string): boolean {
  return ProtectedLoggerFields.includes(
    key.toLowerCase() as (typeof ProtectedLoggerFields)[number],
  );
}

export function redactSensitiveString(value: string): string {
  return ProtectedLoggerFields.reduce((result, field) => {
    const fieldIndex = result.toLowerCase().indexOf(field);
    if (fieldIndex < 0) {
      return result;
    }

    const separatorIndex = result.indexOf("=", fieldIndex);
    if (separatorIndex < 0) {
      return result;
    }

    const nextSeparatorIndex = result.indexOf(" ", separatorIndex);
    const endIndex =
      nextSeparatorIndex < 0 ? result.length : nextSeparatorIndex;

    return `${result.slice(0, separatorIndex + 1)}${RedactedValue}${result.slice(endIndex)}`;
  }, value);
}

export function redactProtectedVariables<T>(value: T, depth = 0): T {
  if (depth > 5 || value === null || typeof value === "undefined") {
    return value;
  }

  if (typeof value === "string") {
    return redactSensitiveString(value) as T;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveString(value.message),
      stack: value.stack ? redactSensitiveString(value.stack) : undefined,
    } as T;
  }

  if (Array.isArray(value)) {
    const values = value as readonly unknown[];

    return values.map((item) =>
      redactProtectedVariables(item, depth + 1),
    ) as unknown as T;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      isProtectedField(key)
        ? RedactedValue
        : redactProtectedVariables(item, depth + 1),
    ]),
  ) as unknown as T;
}

export function createRequestLoggerMiddleware(
  logger: LoggerService,
  appName: string,
  requestIdHeader = "x-request-id",
): RequestLoggerMiddleware {
  return (request, response, next) => {
    const startedAt = Date.now();
    const requestId = getHeader(request, requestIdHeader) ?? randomUUID();
    response.setHeader(requestIdHeader, requestId);

    response.on("finish", () => {
      logger.log(
        JSON.stringify(
          redactProtectedVariables({
            appName,
            durationMs: Date.now() - startedAt,
            method: request.method,
            path: request.originalUrl ?? request.url ?? request.path,
            requestId,
            status: response.statusCode,
          }),
        ),
      );
    });

    next();
  };
}

export function createLogger(params: CommonLoggerFactoryParams): {
  logger: ConsoleLogger;
  middlewares: RequestLoggerMiddleware[];
} {
  const logger = new ConsoleLogger(params.name);
  if (params.levels) {
    logger.setLogLevels(params.levels);
  }

  return {
    logger,
    middlewares: [
      createRequestLoggerMiddleware(
        logger,
        params.name,
        params.requestIdHeader,
      ),
    ],
  };
}
