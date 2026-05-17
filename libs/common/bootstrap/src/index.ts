import { randomUUID } from "node:crypto";
import type { INestApplication, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import {
  ProblemExceptionFilter,
  ProblemResponseTransformer,
} from "@app/common/response";
import {
  createRequestLocaleMiddleware,
  resolveLocaleFromRequest,
  translate,
} from "@app/common/i18n";
import { setupSwagger } from "@app/common/swagger";
import { createProblemValidationPipe } from "@app/common/validation";

export interface BootstrapNestApiOptions {
  appName: string;
  defaultPort: number;
  enableCors?: boolean;
  corsOrigins?: string[];
  openApi?: BootstrapOpenApiOptions;
  rateLimit?: BootstrapRateLimitOptions;
  cookieSecret?: string;
  trustProxy?: boolean | number | string;
}

export interface BootstrapOpenApiOptions {
  enabled?: boolean;
  path?: string;
  title?: string;
  version?: string;
  description?: string;
}

export interface BootstrapRateLimitOptions {
  enabled?: boolean;
  windowMs?: number;
  max?: number;
}

interface RequestLike {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  method?: string;
  originalUrl?: string;
  path?: string;
  socket?: { remoteAddress?: string };
  url?: string;
}

interface ResponseLike {
  statusCode?: number;
  end?: (body?: string) => void;
  on: (event: "finish", listener: () => void) => void;
  setHeader: (name: string, value: string) => void;
}

type NextFunctionLike = () => void;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface ExpressLikeApplication extends INestApplication {
  set?: (name: string, value: unknown) => void;
}

const DefaultRateLimitWindowMs = 60_000;
const DefaultRateLimitMax = 100;
const rateLimitBuckets = new Map<string, RateLimitBucket>();

function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function resolveConfiguredCorsOrigins(
  options: BootstrapNestApiOptions,
): string[] {
  if (options.corsOrigins?.length) {
    return options.corsOrigins;
  }

  return [
    ...parseCorsOrigins(process.env.CORS_ORIGINS),
    ...parseCorsOrigins(process.env.CORS_ORIGIN),
  ];
}

function readBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readPositiveInteger(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (
    !Number.isInteger(parsed) ||
    String(parsed) !== value.trim() ||
    parsed < 1
  ) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function resolvePort(defaultPort: number): number {
  const port = readPositiveInteger("PORT", process.env.PORT, defaultPort);
  if (port > 65_535) {
    throw new Error("PORT must be between 1 and 65535.");
  }

  return port;
}

function getHeader(request: RequestLike, name: string): string | undefined {
  const value =
    request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function createRequestLoggingMiddleware(appName: string) {
  return (
    request: RequestLike,
    response: ResponseLike,
    next: NextFunctionLike,
  ) => {
    const startedAt = Date.now();
    const requestId = getHeader(request, "x-request-id") ?? randomUUID();
    response.setHeader("x-request-id", requestId);

    response.on("finish", () => {
      const logEntry = {
        appName,
        durationMs: Date.now() - startedAt,
        method: request.method,
        path: request.originalUrl ?? request.url ?? request.path,
        requestId,
        status: response.statusCode,
      };
      console.log(JSON.stringify(logEntry));
    });

    next();
  };
}

function createRobotsMiddleware() {
  return (
    request: RequestLike,
    response: ResponseLike,
    next: NextFunctionLike,
  ) => {
    const path = request.path ?? request.url ?? request.originalUrl;
    if (path === "/robots.txt") {
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end?.("User-agent: *\nDisallow: /\n");
      return;
    }

    next();
  };
}

function resolveRateLimitOptions(
  options: BootstrapNestApiOptions,
): Required<BootstrapRateLimitOptions> {
  return {
    enabled:
      options.rateLimit?.enabled ??
      readBoolean(process.env.RATE_LIMIT_ENABLED) ??
      false,
    max:
      options.rateLimit?.max ??
      readPositiveInteger(
        "RATE_LIMIT_MAX",
        process.env.RATE_LIMIT_MAX,
        DefaultRateLimitMax,
      ),
    windowMs:
      options.rateLimit?.windowMs ??
      readPositiveInteger(
        "RATE_LIMIT_WINDOW_MS",
        process.env.RATE_LIMIT_WINDOW_MS,
        DefaultRateLimitWindowMs,
      ),
  };
}

function createRateLimitMiddleware(
  rateLimit: Required<BootstrapRateLimitOptions>,
) {
  return (
    request: RequestLike,
    response: ResponseLike,
    next: NextFunctionLike,
  ) => {
    const now = Date.now();
    const key =
      getHeader(request, "x-forwarded-for") ??
      request.ip ??
      request.socket?.remoteAddress ??
      "unknown";
    const bucket = rateLimitBuckets.get(key);
    const current =
      bucket && bucket.resetAt > now
        ? bucket
        : { count: 0, resetAt: now + rateLimit.windowMs };
    current.count += 1;
    rateLimitBuckets.set(key, current);

    if (current.count > rateLimit.max) {
      response.statusCode = 429;
      response.setHeader(
        "content-type",
        "application/problem+json; charset=utf-8",
      );
      response.setHeader(
        "retry-after",
        String(Math.ceil((current.resetAt - now) / 1000)),
      );
      const locale = resolveLocaleFromRequest(request);
      response.setHeader("content-language", locale);
      response.end?.(
        JSON.stringify({
          type: "https://example.com/problems/rate-limited",
          title: translate("errors.too-many-requests.title", { locale }),
          status: 429,
          detail: translate("errors.rate-limited.detail", { locale }),
          code: "rate-limited",
        }),
      );
      return;
    }

    next();
  };
}

function configureExpressPlatform(
  app: INestApplication,
  options: BootstrapNestApiOptions,
): void {
  const expressApp = app as ExpressLikeApplication;
  expressApp.set?.("query parser", "extended");
  expressApp.set?.(
    "trust proxy",
    options.trustProxy ?? readBoolean(process.env.TRUST_PROXY) ?? false,
  );
}

export async function bootstrapNestApi(
  module: Type<unknown>,
  options: BootstrapNestApiOptions,
): Promise<void> {
  const app = await NestFactory.create(module, {
    bufferLogs: true,
    rawBody: true,
  });

  configureExpressPlatform(app, options);
  app.enableShutdownHooks();
  app.use(createRequestLoggingMiddleware(options.appName));
  app.use(createRobotsMiddleware());
  app.use(cookieParser(options.cookieSecret ?? process.env.COOKIE_SECRET));
  app.use(createRequestLocaleMiddleware());
  app.use(helmet());
  app.useGlobalPipes(createProblemValidationPipe());
  app.useGlobalInterceptors(new ProblemResponseTransformer());
  app.useGlobalFilters(new ProblemExceptionFilter());

  const rateLimit = resolveRateLimitOptions(options);
  if (rateLimit.enabled) {
    app.use(createRateLimitMiddleware(rateLimit));
  }

  if (options.enableCors ?? true) {
    const configuredOrigins = resolveConfiguredCorsOrigins(options);

    if (configuredOrigins.length > 0) {
      app.enableCors({
        origin: configuredOrigins,
        credentials: true,
      });
    } else if (process.env.NODE_ENV !== "production") {
      app.enableCors({
        origin: true,
        credentials: true,
      });
    }
  }

  setupSwagger(app, {
    description: options.openApi?.description,
    enabled: options.openApi?.enabled,
    path: options.openApi?.path,
    title: options.openApi?.title ?? options.appName,
    version: options.openApi?.version,
  });

  await app.listen(resolvePort(options.defaultPort));
}
