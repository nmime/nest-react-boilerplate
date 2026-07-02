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
  "passwd",
  "pwd",
  "token",
  "access-token",
  "access_token",
  "refresh-token",
  "refresh_token",
  "id-token",
  "id_token",
  "signature",
  "x-signature",
  "x-api-key",
  "api-key",
  "api_key",
  "apikey",
  "access_key",
  "secret",
  "client-secret",
  "client_secret",
  "private-key",
  "private_key",
  "session",
  "sid",
  "csrf",
  "xsrf",
] as const;

export const RedactedValue = "[redacted]";

const MaxRedactionDepth = 8;
const MaxStringLength = 8_192;
const JsonOutputValues = new Set(["1", "true", "yes", "json", "structured"]);
const PrettyOutputValues = new Set(["0", "false", "no", "pretty", "text"]);
const HealthCheckPaths = new Set([
  "/favicon.ico",
  "/health",
  "/health/",
  "/healthz",
  "/healthz/",
  "/live",
  "/live/",
  "/livez",
  "/livez/",
  "/metrics",
  "/ready",
  "/ready/",
  "/readyz",
  "/readyz/",
]);

export interface RequestLogLike {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  method?: string;
  originalUrl?: string;
  path?: string;
  socket?: { remoteAddress?: string };
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

export interface StructuredLogEntry {
  appName: string;
  context?: string;
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

type LogPayload = {
  fields: Record<string, unknown>;
  message: string;
};

function getHeader(request: RequestLogLike, name: string): string | undefined {
  const value =
    request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Error) &&
    !(value instanceof Date)
  );
}

function normalizeFieldName(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function isProtectedField(key: string): boolean {
  const normalizedKey = normalizeFieldName(key);

  return ProtectedLoggerFields.some((field) => {
    const normalizedField = normalizeFieldName(field);

    return (
      normalizedKey === normalizedField ||
      normalizedKey.endsWith(normalizedField) ||
      normalizedKey.includes(normalizedField)
    );
  });
}

function redactAuthorizationHeader(value: string): string {
  return value.replace(
    /\b(bearer|basic|digest|token)\s+[a-z0-9._~+/=-]+/giu,
    (_match, scheme: string) => `${scheme} ${RedactedValue}`,
  );
}

export function redactSensitiveString(value: string): string {
  const truncated =
    value.length > MaxStringLength
      ? `${value.slice(0, MaxStringLength)}…[truncated]`
      : value;

  return ProtectedLoggerFields.reduce((result, field) => {
    const escapedField = field.replaceAll(/[$()*+.?[\\\]^{|}]/g, "\\$&");

    return result
      .replace(
        new RegExp(`(${escapedField}\\s*[=:]\\s*)([^\\s,;&]+)`, "giu"),
        `$1${RedactedValue}`,
      )
      .replace(
        new RegExp(`(["']${escapedField}["']\\s*:\\s*["'])(.*?)(["'])`, "giu"),
        `$1${RedactedValue}$3`,
      );
  }, redactAuthorizationHeader(truncated));
}

function serializeError(value: Error): Record<string, unknown> {
  const errorRecord = value as Error & {
    cause?: unknown;
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };

  return redactProtectedVariables({
    name: value.name,
    message: value.message,
    stack: value.stack,
    cause: errorRecord.cause,
    code: errorRecord.code,
    status: errorRecord.status,
    statusCode: errorRecord.statusCode,
  });
}

export function redactProtectedVariables<T>(value: T, depth = 0): T {
  if (value === null || typeof value === "undefined") {
    return value;
  }

  if (typeof value === "string") {
    return redactSensitiveString(value) as T;
  }

  if (typeof value === "bigint") {
    return value.toString() as T;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString() as T;
  }

  if (value instanceof Error) {
    return serializeError(value) as T;
  }

  if (depth >= MaxRedactionDepth) {
    return "[max-depth]" as T;
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

function shouldUseJsonOutput(): boolean {
  const output = process.env.LOG_FORMAT ?? process.env.LOGGER_FORMAT;
  if (output) {
    const normalizedOutput = output.toLowerCase();

    if (PrettyOutputValues.has(normalizedOutput)) {
      return false;
    }

    return JsonOutputValues.has(normalizedOutput);
  }

  return process.env.NODE_ENV !== "development";
}

const LogLevelRanks: Record<LogLevel, number> = {
  debug: 4,
  error: 1,
  fatal: 0,
  log: 3,
  verbose: 5,
  warn: 2,
};

function levelRank(level: LogLevel): number {
  return LogLevelRanks[level];
}

function isLevelEnabled(
  level: LogLevel,
  levels?: readonly LogLevel[],
): boolean {
  if (levels) {
    return levels.includes(level);
  }

  const configuredLevel = process.env.LOG_LEVEL?.toLowerCase() as
    LogLevel | undefined;
  if (configuredLevel) {
    return levelRank(level) <= levelRank(configuredLevel);
  }

  return true;
}

function normalizeMessage(message: unknown): LogPayload {
  const redacted = redactProtectedVariables(message);

  if (typeof redacted === "string") {
    return { fields: {}, message: redacted };
  }

  if (redacted instanceof Error) {
    return {
      fields: { error: serializeError(redacted) },
      message: redacted.message,
    };
  }

  if (isJsonRecord(redacted)) {
    const { message: messageValue, ...fields } = redacted;

    return {
      fields,
      message:
        typeof messageValue === "string"
          ? redactSensitiveString(messageValue)
          : JSON.stringify(redacted),
    };
  }

  return { fields: { value: redacted }, message: JSON.stringify(redacted) };
}

function getRequestPath(request: RequestLogLike): string {
  return request.originalUrl ?? request.url ?? request.path ?? "";
}

function isSuppressedPath(path: string): boolean {
  const pathname = path.split("?")[0] ?? path;

  return HealthCheckPaths.has(pathname);
}

function getClientIp(request: RequestLogLike): string | undefined {
  const forwardedFor = getHeader(request, "x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim();
  }

  return request.ip ?? request.socket?.remoteAddress;
}

export class StructuredConsoleLogger
  extends ConsoleLogger
  implements LoggerService
{
  private readonly appName: string;
  private readonly jsonOutput: boolean;
  private enabledLevels?: readonly LogLevel[];

  constructor(appName: string) {
    super(appName);
    this.appName = appName;
    this.jsonOutput = shouldUseJsonOutput();
  }

  override setLogLevels(levels: LogLevel[]): void {
    this.enabledLevels = levels;
    super.setLogLevels(levels);
  }

  override log(message: unknown, context?: string): void {
    this.write("log", message, context);
  }

  override error(
    message: unknown,
    stackOrContext?: string,
    context?: string,
  ): void {
    this.write("error", message, context ?? stackOrContext, stackOrContext);
  }

  override warn(message: unknown, context?: string): void {
    this.write("warn", message, context);
  }

  override debug(message: unknown, context?: string): void {
    this.write("debug", message, context);
  }

  override verbose(message: unknown, context?: string): void {
    this.write("verbose", message, context);
  }

  override fatal(message: unknown, context?: string): void {
    this.write("fatal", message, context);
  }

  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    stack?: string,
  ): void {
    if (!isLevelEnabled(level, this.enabledLevels)) {
      return;
    }

    const payload = normalizeMessage(message);
    const entry = redactProtectedVariables({
      appName: this.appName,
      context,
      level,
      message: payload.message,
      stack: stack && context !== stack ? stack : undefined,
      timestamp: new Date().toISOString(),
      ...payload.fields,
    }) as StructuredLogEntry;

    if (this.jsonOutput) {
      const line = JSON.stringify(entry);
      if (level === "error" || level === "fatal") {
        process.stderr.write(`${line}\n`);
      } else {
        process.stdout.write(`${line}\n`);
      }
      return;
    }

    this.writePretty(level, JSON.stringify(entry), context);
  }

  private writePretty(level: LogLevel, line: string, context?: string): void {
    if (level === "fatal") {
      super.fatal(line, context);
      return;
    }

    if (level === "error") {
      super.error(line, context);
      return;
    }

    if (level === "warn") {
      super.warn(line, context);
      return;
    }

    if (level === "debug") {
      super.debug(line, context);
      return;
    }

    if (level === "verbose") {
      super.verbose(line, context);
      return;
    }

    super.log(line, context);
  }
}

export function createRequestLoggerMiddleware(
  logger: LoggerService,
  appName: string,
  requestIdHeader = "x-request-id",
): RequestLoggerMiddleware {
  return (request, response, next) => {
    const path = getRequestPath(request);
    if (isSuppressedPath(path)) {
      next();
      return;
    }

    const startedAt = Date.now();
    const requestId = getHeader(request, requestIdHeader) ?? randomUUID();
    response.setHeader(requestIdHeader, requestId);

    response.on("finish", () => {
      logger.log({
        appName,
        durationMs: Date.now() - startedAt,
        ip: getClientIp(request),
        method: request.method,
        path,
        requestId,
        status: response.statusCode,
      });
    });

    next();
  };
}

export function createLogger(params: CommonLoggerFactoryParams): {
  logger: StructuredConsoleLogger;
  middlewares: RequestLoggerMiddleware[];
} {
  const logger = new StructuredConsoleLogger(params.name);
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
