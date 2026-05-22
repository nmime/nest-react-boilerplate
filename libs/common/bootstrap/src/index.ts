import { randomUUID } from "node:crypto";
import fastifyCookie from "@fastify/cookie";
import fastifySession from "@fastify/session";
import type { Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import type { FastifyPluginCallback, Session } from "fastify";
import helmet from "helmet";
import { Pool, type PoolClient } from "pg";
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

type FastifySessionOptions = Parameters<typeof fastifySession>[1];
type SessionSameSite = "lax" | "strict" | "none";
type SessionStoreCallback = (error?: unknown) => void;
type SessionStoreGetCallback = (
  error: unknown,
  session?: Session | null,
) => void;

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const DefaultRateLimitWindowMs = 60_000;
const DefaultRateLimitMax = 100;
const DefaultSessionCookieMaxAgeSeconds = 604_800;
const MinimumSessionSecretLength = 32;
const DevelopmentSessionSecretPadding = ":development-session-padding";
const rateLimitBuckets = new Map<string, RateLimitBucket>();

class FastifyPostgresSessionStore {
  private readonly initialized: Promise<void>;
  private readonly pool: Pool;

  constructor(
    databaseUrl: string,
    private readonly defaultMaxAgeSeconds: number,
  ) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.initialized = this.createTable(this.pool);
  }

  async init(): Promise<void> {
    await this.initialized;
  }

  get(sessionId: string, callback: SessionStoreGetCallback): void {
    void this.getSession(sessionId)
      .then((session) => callback(null, session))
      .catch((error: unknown) => callback(error));
  }

  set(
    sessionId: string,
    session: Session,
    callback: SessionStoreCallback,
  ): void {
    void this.setSession(sessionId, session)
      .then(() => callback())
      .catch((error: unknown) => callback(error));
  }

  destroy(sessionId: string, callback: SessionStoreCallback): void {
    void this.destroySession(sessionId)
      .then(() => callback())
      .catch((error: unknown) => callback(error));
  }

  private async createTable(client: Pool | PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS fastify_sessions (
        sid varchar PRIMARY KEY,
        sess jsonb NOT NULL,
        expire timestamptz NOT NULL
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS fastify_sessions_expire_idx
      ON fastify_sessions (expire)
    `);
  }

  private async getSession(sessionId: string): Promise<Session | null> {
    await this.initialized;
    const result = await this.pool.query<{ sess: Session; expire: Date }>(
      "SELECT sess, expire FROM fastify_sessions WHERE sid = $1",
      [sessionId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const expiresAt =
      row.expire instanceof Date ? row.expire : new Date(row.expire);
    if (expiresAt.getTime() <= Date.now()) {
      await this.deleteSession(sessionId);
      return null;
    }

    return this.reviveSession(row.sess);
  }

  private async setSession(sessionId: string, session: Session): Promise<void> {
    await this.initialized;
    await this.pool.query(
      `
        INSERT INTO fastify_sessions (sid, sess, expire)
        VALUES ($1, $2, $3)
        ON CONFLICT (sid)
        DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire
      `,
      [sessionId, this.serializeSession(session), this.resolveExpiry(session)],
    );
  }

  private async destroySession(sessionId: string): Promise<void> {
    await this.initialized;
    await this.deleteSession(sessionId);
  }

  private async deleteSession(sessionId: string): Promise<void> {
    await this.pool.query("DELETE FROM fastify_sessions WHERE sid = $1", [
      sessionId,
    ]);
  }

  private serializeSession(session: Session): Session {
    return JSON.parse(JSON.stringify(session)) as Session;
  }

  private reviveSession(session: Session): Session {
    const cookie = session.cookie as
      | (Session["cookie"] & { expires?: Date | string | null })
      | undefined;
    if (cookie?.expires && !(cookie.expires instanceof Date)) {
      const expires = new Date(cookie.expires);
      if (!Number.isNaN(expires.getTime())) {
        cookie.expires = expires;
      }
    }

    return session;
  }

  private resolveExpiry(session: Session): Date {
    const cookie = session.cookie as
      | (Session["cookie"] & { expires?: Date | string | null })
      | undefined;
    if (cookie?.expires) {
      const expires =
        cookie.expires instanceof Date
          ? cookie.expires
          : new Date(cookie.expires);
      if (!Number.isNaN(expires.getTime())) {
        return expires;
      }
    }

    let maxAge = this.defaultMaxAgeSeconds * 1000;
    if (typeof cookie?.originalMaxAge === "number" && cookie.originalMaxAge > 0) {
      maxAge = cookie.originalMaxAge;
    } else if (typeof cookie?.maxAge === "number" && cookie.maxAge > 0) {
      maxAge = cookie.maxAge;
    }

    return new Date(Date.now() + maxAge);
  }
}

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

function readOptionalSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function ensureMinimumSessionSecretLength(
  secret: string,
  isProduction: boolean,
): string {
  if (secret.length >= MinimumSessionSecretLength) {
    return secret;
  }

  if (isProduction) {
    throw new Error(
      "SESSION_SECRET or AUTH_JWT_SECRET must be at least 32 characters in production.",
    );
  }

  const padded = `${secret}${DevelopmentSessionSecretPadding}`;
  return padded.length >= MinimumSessionSecretLength
    ? padded
    : padded.padEnd(
        MinimumSessionSecretLength,
        DevelopmentSessionSecretPadding,
      );
}

function resolveSessionSecret(isProduction: boolean): string {
  const secret =
    readOptionalSecret(process.env.SESSION_SECRET) ??
    readOptionalSecret(process.env.AUTH_JWT_SECRET);
  if (secret) {
    return ensureMinimumSessionSecretLength(secret, isProduction);
  }
  if (isProduction) {
    throw new Error(
      "SESSION_SECRET or AUTH_JWT_SECRET must be configured in production.",
    );
  }

  return ensureMinimumSessionSecretLength(
    "nrb-development-session-secret",
    false,
  );
}

function resolveSessionCookieName(isProduction: boolean): string {
  return (
    readOptionalSecret(process.env.SESSION_COOKIE_NAME) ??
    (isProduction ? "__Host-nrb.sid" : "nrb.sid")
  );
}

function resolveSessionCookieSameSite(): SessionSameSite {
  const value = (process.env.SESSION_COOKIE_SAME_SITE ?? "lax")
    .trim()
    .toLowerCase();
  if (value === "lax" || value === "strict" || value === "none") {
    return value;
  }

  throw new Error(
    'SESSION_COOKIE_SAME_SITE must be one of "lax", "strict", or "none".',
  );
}

function resolveSessionCookieSecure(isProduction: boolean): boolean {
  if (isProduction) {
    return true;
  }

  return readBoolean(process.env.SESSION_COOKIE_SECURE) ?? false;
}

function createSessionStore(
  isProduction: boolean,
  maxAgeSeconds: number,
): FastifyPostgresSessionStore | undefined {
  const databaseUrl = readOptionalSecret(process.env.DATABASE_URL);
  if (databaseUrl) {
    return new FastifyPostgresSessionStore(databaseUrl, maxAgeSeconds);
  }

  if (isProduction) {
    throw new Error(
      "DATABASE_URL must be configured in production for server-side sessions.",
    );
  }

  return undefined;
}

async function registerFastifySession(
  app: NestFastifyApplication,
): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";
  const maxAgeSeconds = readPositiveInteger(
    "SESSION_COOKIE_MAX_AGE_SECONDS",
    process.env.SESSION_COOKIE_MAX_AGE_SECONDS,
    DefaultSessionCookieMaxAgeSeconds,
  );
  const store = createSessionStore(isProduction, maxAgeSeconds);
  await store?.init();

  const fastify = app.getHttpAdapter().getInstance();
  const sessionOptions: FastifySessionOptions = {
    cookie: {
      httpOnly: true,
      maxAge: maxAgeSeconds * 1000,
      path: "/",
      sameSite: resolveSessionCookieSameSite(),
      secure: resolveSessionCookieSecure(isProduction),
    },
    cookieName: resolveSessionCookieName(isProduction),
    rolling: true,
    saveUninitialized: false,
    secret: resolveSessionSecret(isProduction),
    ...(store ? { store } : {}),
  };

  await fastify.register(fastifyCookie as unknown as FastifyPluginCallback);
  await fastify.register(
    fastifySession as unknown as FastifyPluginCallback<FastifySessionOptions>,
    sessionOptions,
  );
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
  const enabled =
    options.rateLimit?.enabled ??
    readBoolean(process.env.RATE_LIMIT_ENABLED) ??
    (process.env.NODE_ENV === "production");

  return {
    enabled,
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
    const key = request.ip ?? request.socket?.remoteAddress ?? "unknown";
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
          type: "urn:problem:nest-react-boilerplate:rate-limited",
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

export async function bootstrapNestApi(
  module: Type<unknown>,
  options: BootstrapNestApiOptions,
): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    module,
    new FastifyAdapter({
      logger: false,
      trustProxy:
        options.trustProxy ?? readBoolean(process.env.TRUST_PROXY) ?? false,
    }),
    {
      bufferLogs: true,
      rawBody: true,
    },
  );

  app.enableShutdownHooks();
  await registerFastifySession(app);
  app.use(createRequestLoggingMiddleware(options.appName));
  app.use(createRobotsMiddleware());
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
