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
  closeRedisClient,
  createRedisClient,
  RedisMode,
  type RedisClientLike,
  type RedisConnectionConfig,
  type RedisHost,
} from "@app/common/redis";
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

export type BackendRateLimitStore = "memory" | "redis";
export type BackendRateLimitStorePreference = BackendRateLimitStore | "auto";

export interface BackendEnvironmentConfig {
  corsOrigins: string[];
  host?: string;
  isProduction: boolean;
  nodeEnv?: string;
  port: number;
  rateLimit: Required<BootstrapRateLimitOptions> & {
    store: BackendRateLimitStore;
    storePreference: BackendRateLimitStorePreference;
    redis?: RedisConnectionConfig;
  };
  session: {
    cookieName: string;
    databaseUrl?: string;
    maxAgeSeconds: number;
    sameSite: SessionSameSite;
    secure: boolean;
    secret: string;
  };
  trustProxy: boolean | number | string;
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

interface RateLimitStoreHit {
  count: number;
  resetAt: number;
}

interface RateLimitStore {
  readonly name: BackendRateLimitStore;
  close?: () => Promise<unknown>;
  init?: () => Promise<void>;
  increment: (
    key: string,
    windowMs: number,
  ) => RateLimitStoreHit | Promise<RateLimitStoreHit>;
}

const DefaultRateLimitWindowMs = 60_000;
const DefaultRateLimitMax = 100;
const DefaultSessionCookieMaxAgeSeconds = 604_800;
const MinimumSessionSecretLength = 32;
const DevelopmentSessionSecretPadding = ":development-session-padding";
const rateLimitBuckets = new Map<string, RateLimitBucket>();

class FastifyPostgresSessionStore {
  private initialized: Promise<void> | undefined;
  private readonly pool: Pool;

  constructor(
    databaseUrl: string,
    private readonly defaultMaxAgeSeconds: number,
  ) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async init(): Promise<void> {
    await this.ensureInitialized();
  }

  private ensureInitialized(): Promise<void> {
    this.initialized ??= this.createTable(this.pool);
    return this.initialized;
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
    await this.ensureInitialized();
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
    await this.ensureInitialized();
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
    await this.ensureInitialized();
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
    if (
      typeof cookie?.originalMaxAge === "number" &&
      cookie.originalMaxAge > 0
    ) {
      maxAge = cookie.originalMaxAge;
    } else if (typeof cookie?.maxAge === "number" && cookie.maxAge > 0) {
      maxAge = cookie.maxAge;
    }

    return new Date(Date.now() + maxAge);
  }
}

class MemoryRateLimitStore implements RateLimitStore {
  readonly name = "memory" as const;
  private cleanupCounter = 0;

  increment(key: string, windowMs: number): RateLimitStoreHit {
    const now = Date.now();
    if (this.cleanupCounter++ % 100 === 0) {
      this.removeExpiredBuckets(now);
    }

    const bucket = rateLimitBuckets.get(key);
    const current =
      bucket && bucket.resetAt > now
        ? bucket
        : { count: 0, resetAt: now + windowMs };
    current.count += 1;
    rateLimitBuckets.set(key, current);

    return { count: current.count, resetAt: current.resetAt };
  }

  private removeExpiredBuckets(now: number): void {
    for (const [key, bucket] of rateLimitBuckets.entries()) {
      if (bucket.resetAt <= now) {
        rateLimitBuckets.delete(key);
      }
    }
  }
}

class RedisRateLimitStore implements RateLimitStore {
  readonly name = "redis" as const;

  constructor(private readonly redis: RedisClientLike) {}

  async init(): Promise<void> {
    await this.redis.ping();
  }

  async increment(key: string, windowMs: number): Promise<RateLimitStoreHit> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, Math.ceil(windowMs / 1000));
    }

    return { count, resetAt: Date.now() + windowMs };
  }

  async close(): Promise<unknown> {
    return await closeRedisClient(this.redis);
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
  env: NodeJS.ProcessEnv,
): string[] {
  if (options.corsOrigins?.length) {
    return options.corsOrigins;
  }

  return [
    ...parseCorsOrigins(env.CORS_ORIGINS),
    ...parseCorsOrigins(env.CORS_ORIGIN),
  ];
}

function readBoolean(
  name: string,
  value: string | undefined,
): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  switch (normalized) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      throw new Error(`${name} must be a boolean value.`);
  }
}

function readPositiveInteger(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  const parsed = readOptionalPositiveInteger(name, value);
  return parsed ?? fallback;
}

function readOptionalPositiveInteger(
  name: string,
  value: string | undefined,
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== trimmed || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function readOptionalNonNegativeInteger(
  name: string,
  value: string | undefined,
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== trimmed || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return parsed;
}

function readOptionalSecret(value: string | undefined): string | undefined {
  return readOptionalString(value);
}

function readOptionalString(value: string | undefined): string | undefined {
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

function resolveSessionSecret(
  isProduction: boolean,
  env: NodeJS.ProcessEnv,
): string {
  const secret =
    readOptionalSecret(env.SESSION_SECRET) ??
    readOptionalSecret(env.AUTH_JWT_SECRET);
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

function resolveSessionCookieName(
  isProduction: boolean,
  env: NodeJS.ProcessEnv,
): string {
  return (
    readOptionalSecret(env.SESSION_COOKIE_NAME) ??
    (isProduction ? "__Host-nrb.sid" : "nrb.sid")
  );
}

function resolveSessionCookieSameSite(env: NodeJS.ProcessEnv): SessionSameSite {
  const value = (env.SESSION_COOKIE_SAME_SITE ?? "lax").trim().toLowerCase();
  if (value === "lax" || value === "strict" || value === "none") {
    return value;
  }

  throw new Error(
    'SESSION_COOKIE_SAME_SITE must be one of "lax", "strict", or "none".',
  );
}

function resolveSessionCookieSecure(
  isProduction: boolean,
  env: NodeJS.ProcessEnv,
): boolean {
  if (isProduction) {
    return true;
  }

  return (
    readBoolean("SESSION_COOKIE_SECURE", env.SESSION_COOKIE_SECURE) ?? false
  );
}

function createSessionStore(
  config: BackendEnvironmentConfig,
): FastifyPostgresSessionStore | undefined {
  return config.session.databaseUrl
    ? new FastifyPostgresSessionStore(
        config.session.databaseUrl,
        config.session.maxAgeSeconds,
      )
    : undefined;
}

async function registerFastifySession(
  app: NestFastifyApplication,
  config: BackendEnvironmentConfig,
): Promise<void> {
  const store = createSessionStore(config);
  await store?.init();

  const fastify = app.getHttpAdapter().getInstance();
  const sessionOptions: FastifySessionOptions = {
    cookie: {
      httpOnly: true,
      maxAge: config.session.maxAgeSeconds * 1000,
      path: "/",
      sameSite: config.session.sameSite,
      secure: config.session.secure,
    },
    cookieName: config.session.cookieName,
    rolling: true,
    saveUninitialized: false,
    secret: config.session.secret,
    ...(store ? { store } : {}),
  };

  await fastify.register(fastifyCookie as unknown as FastifyPluginCallback);
  await fastify.register(
    fastifySession as unknown as FastifyPluginCallback<FastifySessionOptions>,
    sessionOptions,
  );
}

function resolveHost(env: NodeJS.ProcessEnv): string | undefined {
  return readOptionalString(env.HOST);
}

function resolvePort(env: NodeJS.ProcessEnv, defaultPort: number): number {
  const port = readPositiveInteger("PORT", env.PORT, defaultPort);
  if (port > 65_535) {
    throw new Error("PORT must be between 1 and 65535.");
  }

  return port;
}

function parseRateLimitStorePreference(
  value: string | undefined,
): BackendRateLimitStorePreference {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "auto";
  }

  if (
    normalized === "auto" ||
    normalized === "memory" ||
    normalized === "redis"
  ) {
    return normalized;
  }

  throw new Error(
    'RATE_LIMIT_STORE must be one of "auto", "memory", or "redis".',
  );
}

function parseRedisMode(value: string | undefined): RedisMode {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case undefined:
    case "":
    case RedisMode.Single:
      return RedisMode.Single;
    case RedisMode.Sentinel:
      return RedisMode.Sentinel;
    case RedisMode.Cluster:
      return RedisMode.Cluster;
    default:
      throw new Error(
        'REDIS_MODE must be one of "single", "sentinel", or "cluster".',
      );
  }
}

function parseRedisHosts(value: string | undefined): RedisHost[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed.split(",").map((entry) => {
    const host = entry.trim();
    const [hostName, port = "6379"] = host.split(":");
    const parsedPort = Number.parseInt(port, 10);

    if (
      !hostName ||
      !Number.isInteger(parsedPort) ||
      String(parsedPort) !== port ||
      parsedPort < 1 ||
      parsedPort > 65_535
    ) {
      throw new Error(`Invalid REDIS_HOSTS entry: ${host}`);
    }

    return { host: hostName, port: parsedPort };
  });
}

function resolveRedisConnectionConfig(
  env: NodeJS.ProcessEnv,
): RedisConnectionConfig | undefined {
  const url = readOptionalString(env.REDIS_URL);
  const hosts = parseRedisHosts(env.REDIS_HOSTS);
  if (!url && hosts.length === 0) {
    return undefined;
  }

  const mode = parseRedisMode(env.REDIS_MODE);
  if (
    (mode === RedisMode.Cluster || mode === RedisMode.Sentinel) &&
    hosts.length === 0
  ) {
    throw new Error(
      "REDIS_HOSTS is required for cluster or sentinel Redis mode.",
    );
  }

  const sentinelGroupIdentifier = readOptionalString(
    env.REDIS_SENTINEL_GROUP_IDENTIFIER,
  );
  if (mode === RedisMode.Sentinel && !sentinelGroupIdentifier) {
    throw new Error(
      "REDIS_SENTINEL_GROUP_IDENTIFIER is required for sentinel Redis mode.",
    );
  }

  return {
    mode,
    url,
    hosts,
    password: readOptionalString(env.REDIS_PASSWORD),
    db: readOptionalNonNegativeInteger("REDIS_DB", env.REDIS_DB),
    sentinelGroupIdentifier,
    keyPrefix: readOptionalString(env.REDIS_KEY_PREFIX),
    lazyConnect: true,
  };
}

function resolveRateLimitOptions(
  options: BootstrapNestApiOptions,
  env: NodeJS.ProcessEnv,
  isProduction: boolean,
): BackendEnvironmentConfig["rateLimit"] {
  const enabled =
    options.rateLimit?.enabled ??
    readBoolean("RATE_LIMIT_ENABLED", env.RATE_LIMIT_ENABLED) ??
    isProduction;
  const storePreference = parseRateLimitStorePreference(env.RATE_LIMIT_STORE);
  const redis =
    enabled && storePreference !== "memory"
      ? resolveRedisConnectionConfig(env)
      : undefined;

  if (enabled && storePreference === "redis" && !redis) {
    throw new Error(
      "RATE_LIMIT_STORE=redis requires REDIS_URL or REDIS_HOSTS to be configured.",
    );
  }

  const store: BackendRateLimitStore =
    enabled && storePreference !== "memory" && redis ? "redis" : "memory";

  return {
    enabled,
    store,
    storePreference,
    redis: store === "redis" ? redis : undefined,
    max:
      options.rateLimit?.max ??
      readPositiveInteger(
        "RATE_LIMIT_MAX",
        env.RATE_LIMIT_MAX,
        DefaultRateLimitMax,
      ),
    windowMs:
      options.rateLimit?.windowMs ??
      readPositiveInteger(
        "RATE_LIMIT_WINDOW_MS",
        env.RATE_LIMIT_WINDOW_MS,
        DefaultRateLimitWindowMs,
      ),
  };
}

export function resolveBackendEnvironmentConfig(
  options: BootstrapNestApiOptions,
  env: NodeJS.ProcessEnv = process.env,
): BackendEnvironmentConfig {
  const isProduction = env.NODE_ENV === "production";
  const databaseUrl = readOptionalSecret(env.DATABASE_URL);
  if (isProduction && !databaseUrl) {
    throw new Error(
      "DATABASE_URL must be configured in production for server-side sessions.",
    );
  }

  const port = resolvePort(env, options.defaultPort);

  return {
    corsOrigins: resolveConfiguredCorsOrigins(options, env),
    host: resolveHost(env),
    isProduction,
    nodeEnv: readOptionalString(env.NODE_ENV),
    port,
    rateLimit: resolveRateLimitOptions(options, env, isProduction),
    session: {
      cookieName: resolveSessionCookieName(isProduction, env),
      databaseUrl,
      maxAgeSeconds: readPositiveInteger(
        "SESSION_COOKIE_MAX_AGE_SECONDS",
        env.SESSION_COOKIE_MAX_AGE_SECONDS,
        DefaultSessionCookieMaxAgeSeconds,
      ),
      sameSite: resolveSessionCookieSameSite(env),
      secure: resolveSessionCookieSecure(isProduction, env),
      secret: resolveSessionSecret(isProduction, env),
    },
    trustProxy:
      options.trustProxy ??
      readBoolean("TRUST_PROXY", env.TRUST_PROXY) ??
      false,
  };
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
        /* v8 ignore next -- some adapters expose only one URL-like request field. */
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

function createRateLimitStore(
  rateLimit: BackendEnvironmentConfig["rateLimit"],
): RateLimitStore {
  if (rateLimit.store === "redis" && rateLimit.redis) {
    return new RedisRateLimitStore(createRedisClient(rateLimit.redis));
  }

  return new MemoryRateLimitStore();
}

function registerRateLimitStoreShutdown(
  app: NestFastifyApplication,
  store: RateLimitStore,
): void {
  if (!store.close) {
    return;
  }

  const fastify = app.getHttpAdapter().getInstance() as {
    addHook?: (hook: "onClose", handler: () => Promise<void>) => void;
  };
  fastify.addHook?.("onClose", async () => {
    await store.close?.();
  });
}

function warnAboutRateLimitStore(config: BackendEnvironmentConfig): void {
  if (
    config.isProduction &&
    config.rateLimit.enabled &&
    config.rateLimit.store === "memory"
  ) {
    console.warn(
      "Production rate limiting is using in-memory per-process storage. " +
        "Set RATE_LIMIT_STORE=redis with REDIS_URL or REDIS_HOSTS for shared multi-instance enforcement, " +
        "or enforce equivalent limits at the ingress/API gateway.",
    );
  }
}

function sanitizeRateLimitKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/gu, "_");
}

function buildRateLimitKey(appName: string, request: RequestLike): string {
  const client = request.ip ?? request.socket?.remoteAddress ?? "unknown";
  return `rate-limit:${sanitizeRateLimitKeyPart(appName)}:ip:${sanitizeRateLimitKeyPart(client)}`;
}

function writeProblemResponse(
  response: ResponseLike,
  status: number,
  body: {
    code: string;
    detail: string;
    title: string;
    type: string;
  },
  locale?: string,
): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/problem+json; charset=utf-8");
  if (locale) {
    response.setHeader("content-language", locale);
  }
  response.end?.(
    JSON.stringify({
      type: body.type,
      title: body.title,
      status,
      detail: body.detail,
      code: body.code,
    }),
  );
}

function handleRateLimitHit(
  hit: RateLimitStoreHit,
  rateLimit: BackendEnvironmentConfig["rateLimit"],
  request: RequestLike,
  response: ResponseLike,
  next: NextFunctionLike,
): void {
  const now = Date.now();
  const retryAfterSeconds = Math.max(Math.ceil((hit.resetAt - now) / 1000), 1);
  response.setHeader("x-ratelimit-limit", String(rateLimit.max));
  response.setHeader(
    "x-ratelimit-remaining",
    String(Math.max(rateLimit.max - hit.count, 0)),
  );
  response.setHeader(
    "x-ratelimit-reset",
    String(Math.ceil(hit.resetAt / 1000)),
  );

  if (hit.count > rateLimit.max) {
    response.setHeader("retry-after", String(retryAfterSeconds));
    const locale = resolveLocaleFromRequest(request);
    writeProblemResponse(
      response,
      429,
      {
        type: "urn:problem:nest-react-boilerplate:rate-limited",
        title: translate("errors.too-many-requests.title", { locale }),
        detail: translate("errors.rate-limited.detail", { locale }),
        code: "rate-limited",
      },
      locale,
    );
    return;
  }

  next();
}

function handleRateLimitStoreError(
  error: unknown,
  response: ResponseLike,
): void {
  console.error(
    JSON.stringify({
      event: "rate_limit_store_error",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  writeProblemResponse(response, 503, {
    type: "urn:problem:nest-react-boilerplate:rate-limit-unavailable",
    title: "Service Unavailable",
    detail: "Rate limit storage is unavailable.",
    code: "rate-limit-unavailable",
  });
}

function createRateLimitMiddleware(
  appName: string,
  rateLimit: BackendEnvironmentConfig["rateLimit"],
  store: RateLimitStore,
) {
  return (
    request: RequestLike,
    response: ResponseLike,
    next: NextFunctionLike,
  ) => {
    const hit = store.increment(
      buildRateLimitKey(appName, request),
      rateLimit.windowMs,
    );

    if (hit instanceof Promise) {
      void hit
        .then((resolvedHit) =>
          handleRateLimitHit(resolvedHit, rateLimit, request, response, next),
        )
        .catch((error: unknown) => handleRateLimitStoreError(error, response));
      return;
    }

    handleRateLimitHit(hit, rateLimit, request, response, next);
  };
}

export async function bootstrapNestApi(
  module: Type<unknown>,
  options: BootstrapNestApiOptions,
): Promise<void> {
  const config = resolveBackendEnvironmentConfig(options);
  const app = await NestFactory.create<NestFastifyApplication>(
    module,
    new FastifyAdapter({
      logger: false,
      trustProxy: config.trustProxy,
    }),
    {
      bufferLogs: true,
      rawBody: true,
    },
  );

  app.enableShutdownHooks();
  await registerFastifySession(app, config);
  app.use(createRequestLoggingMiddleware(options.appName));
  app.use(createRobotsMiddleware());
  app.use(createRequestLocaleMiddleware());
  app.use(helmet());
  app.useGlobalPipes(createProblemValidationPipe());
  app.useGlobalInterceptors(new ProblemResponseTransformer());
  app.useGlobalFilters(new ProblemExceptionFilter());

  if (config.rateLimit.enabled) {
    const rateLimitStore = createRateLimitStore(config.rateLimit);
    await rateLimitStore.init?.();
    registerRateLimitStoreShutdown(app, rateLimitStore);
    warnAboutRateLimitStore(config);
    app.use(
      createRateLimitMiddleware(
        options.appName,
        config.rateLimit,
        rateLimitStore,
      ),
    );
  }

  if (options.enableCors ?? true) {
    if (config.corsOrigins.length > 0) {
      app.enableCors({
        origin: config.corsOrigins,
        credentials: true,
      });
    } else if (!config.isProduction) {
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

  if (config.host) {
    await app.listen(config.port, config.host);
  } else {
    await app.listen(config.port);
  }
}
