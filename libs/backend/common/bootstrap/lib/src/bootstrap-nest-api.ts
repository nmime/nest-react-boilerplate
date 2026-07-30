import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import type { DynamicModule, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from 'helmet';
import { getPortEnvVarName } from './util/port.util';
import {
  assertDurableDatabaseEnvironment,
  DurableDatabaseRuntimeInjectToken,
  type BackendSessionStore,
  type DurableDatabaseRuntime,
} from './durable-database.runtime';
import {
  closeRedisClient,
  createRedisClient,
  RedisMode,
  type RedisClientLike,
  type RedisConnectionConfig,
  type RedisHost,
} from '@app/backend-common-redis';
import { ExceptionsFilter, ExceptionsResponseTransformer, mergeVaryHeader } from '@app/backend-common-response';
import {
  createProblemDetails,
  localizeProblemDetails,
  resolveProblemContentLanguage,
  type ProblemDetailsResponse,
} from '@app/backend-common-exception';
import { ClsInterceptor } from './cls.interceptor';
import { createRequestLocaleMiddleware, resolveLocaleFromRequest } from '@app/backend-common-i18n';
import { setupSwagger, type SwaggerAuthScheme } from '@app/backend-common-swagger';
import { createValidationPipe } from '@app/backend-common-validation';
import { createRequestLoggingMiddleware } from './request-logging.middleware';
import { createLogger } from '@app/backend-common-logger';
import { initOpenTelemetry, shutdownOpenTelemetry } from '@app/backend-common-otel';
import { normalizeRequestId, requestContext } from '@app/backend-common-request-context';
import { problemInstanceForRequestId, problemTypeForCode } from '@app/common-problem-details';
import { withOpenTelemetryLifecycle } from './open-telemetry-lifecycle';

export interface BootstrapNestApiOptions {
  appName: string;
  /** Explicit port this service listens on. */
  port: number;
  enableCors?: boolean;
  corsOrigins?: string[];
  openApi?: BootstrapOpenApiOptions;
  rateLimit?: BootstrapRateLimitOptions;
  cookieSecret?: string;
  trustProxy?: boolean | number | string;
}

export interface BootstrapOpenApiOptions {
  authSchemes?: readonly SwaggerAuthScheme[];
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

export type BackendRateLimitStore = 'memory' | 'redis';
export type BackendRateLimitStorePreference = BackendRateLimitStore | 'auto';
export type BackendSessionPersistence = 'memory' | 'mongodb' | 'postgres';
type BackendPortSource = 'configured';

export interface BackendEnvironmentConfig {
  corsOrigins: string[];
  host?: string;
  isProduction: boolean;
  nodeEnv?: string;
  port: number;
  portSource: BackendPortSource;
  rateLimit: Required<BootstrapRateLimitOptions> & {
    store: BackendRateLimitStore;
    storePreference: BackendRateLimitStorePreference;
    redis?: RedisConnectionConfig;
  };
  session: {
    cookieName: string;
    maxAgeSeconds: number;
    persistence: BackendSessionPersistence;
    sameSite: SessionSameSite;
    secure: boolean;
    secret: string;
    sweepIntervalMs: number;
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
  on: (event: 'finish', listener: () => void) => void;
  setHeader: (name: string, value: string) => void;
  getHeader?: (name: string) => unknown;
}

type NextFunctionLike = () => void;

type FastifySessionOptions = Parameters<typeof fastifySession>[1];
type FastifyPluginRegister = (plugin: unknown, options?: unknown) => PromiseLike<unknown>;
type SessionSameSite = 'lax' | 'strict' | 'none';

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
  increment: (key: string, windowMs: number) => RateLimitStoreHit | Promise<RateLimitStoreHit>;
}

const DefaultRateLimitWindowMs = 60_000;
const DefaultRateLimitMax = 100;
const DefaultSessionCookieMaxAgeSeconds = 604_800;
const DefaultSessionSweepIntervalMs = 600_000;
const MinimumSessionSecretLength = 32;
const DevelopmentSessionSecretPadding = ':development-session-padding';
const rateLimitBuckets = new Map<string, RateLimitBucket>();

class MemoryRateLimitStore implements RateLimitStore {
  readonly name = 'memory' as const;
  private cleanupCounter = 0;

  increment(key: string, windowMs: number): RateLimitStoreHit {
    const now = Date.now();
    if (this.cleanupCounter++ % 100 === 0) {
      this.removeExpiredBuckets(now);
    }

    const bucket = rateLimitBuckets.get(key);
    const current = bucket && bucket.resetAt > now ? bucket : { count: 0, resetAt: now + windowMs };
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

export class RedisRateLimitStore implements RateLimitStore {
  readonly name = 'redis' as const;

  constructor(private readonly redis: RedisClientLike) {}

  async init(): Promise<void> {
    await this.redis.ping();
  }

  async increment(key: string, windowMs: number): Promise<RateLimitStoreHit> {
    // A single atomic primitive performs the counter INCR and attaches the
    // window TTL together, closing the sub-millisecond race where the counter
    // key could expire between a separate reset-marker SET and the INCR. The
    // reset time is derived from the key's actual remaining TTL, so it stays
    // fixed across hits within the window instead of sliding forward.
    return await this.redis.incrementWithWindow(key, Math.max(windowMs, 1));
  }

  async close(): Promise<unknown> {
    return await closeRedisClient(this.redis);
  }
}

function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function resolveConfiguredCorsOrigins(options: BootstrapNestApiOptions, env: NodeJS.ProcessEnv): string[] {
  if (options.corsOrigins?.length) {
    return options.corsOrigins;
  }

  return [...parseCorsOrigins(env.CORS_ORIGINS), ...parseCorsOrigins(env.CORS_ORIGIN)];
}

function readBoolean(name: string, value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  switch (normalized) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      throw new Error(`${name} must be a boolean value.`);
  }
}

function readPositiveInteger(name: string, value: string | undefined, fallback: number): number {
  const parsed = readOptionalPositiveInteger(name, value);
  return parsed ?? fallback;
}

function readOptionalPositiveInteger(name: string, value: string | undefined): number | undefined {
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

function readOptionalNonNegativeInteger(name: string, value: string | undefined): number | undefined {
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

function ensureMinimumSessionSecretLength(secret: string, isProduction: boolean): string {
  if (secret.length >= MinimumSessionSecretLength) {
    return secret;
  }

  if (isProduction) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production.');
  }

  const padded = `${secret}${DevelopmentSessionSecretPadding}`;
  return padded.length >= MinimumSessionSecretLength
    ? padded
    : padded.padEnd(MinimumSessionSecretLength, DevelopmentSessionSecretPadding);
}

function resolveSessionSecret(isProduction: boolean, env: NodeJS.ProcessEnv): string {
  const secret = readOptionalSecret(env.SESSION_SECRET);
  if (secret) {
    return ensureMinimumSessionSecretLength(secret, isProduction);
  }
  if (isProduction) {
    throw new Error('SESSION_SECRET must be configured in production.');
  }

  return ensureMinimumSessionSecretLength('nrb-development-session-secret', false);
}

function resolveSessionCookieName(isProduction: boolean, env: NodeJS.ProcessEnv): string {
  return readOptionalSecret(env.SESSION_COOKIE_NAME) ?? (isProduction ? '__Host-nrb.sid' : 'nrb.sid');
}

function resolveSessionCookieSameSite(env: NodeJS.ProcessEnv): SessionSameSite {
  const value = (env.SESSION_COOKIE_SAME_SITE ?? 'lax').trim().toLowerCase();
  if (value === 'lax' || value === 'strict' || value === 'none') {
    return value;
  }

  throw new Error('SESSION_COOKIE_SAME_SITE must be one of "lax", "strict", or "none".');
}

function resolveSessionCookieSecure(isProduction: boolean, env: NodeJS.ProcessEnv): boolean {
  if (isProduction) {
    return true;
  }

  return readBoolean('SESSION_COOKIE_SECURE', env.SESSION_COOKIE_SECURE) ?? false;
}

function resolveSessionPersistence(env: NodeJS.ProcessEnv): BackendSessionPersistence {
  const persistence = env.AUTH_PERSISTENCE?.trim().toLowerCase();
  if (!persistence && env.VITEST) {
    return 'memory';
  }
  if (persistence === 'memory' || persistence === 'mongodb' || persistence === 'postgres') {
    return persistence;
  }
  if (persistence) {
    throw new Error('AUTH_PERSISTENCE must be one of memory, mongodb, or postgres.');
  }
  return 'postgres';
}

function createSessionStore(
  config: BackendEnvironmentConfig,
  runtime: DurableDatabaseRuntime | undefined,
): BackendSessionStore | undefined {
  if (config.session.persistence === 'memory') {
    return undefined;
  }
  if (!runtime) {
    throw new Error('The selected backend does not include a durable database runtime. Rerun `pnpm nrb setup`.');
  }
  assertDurableDatabaseEnvironment(runtime.provider);
  if (config.session.persistence !== runtime.provider) {
    throw new Error(
      `AUTH_PERSISTENCE=${config.session.persistence} does not match the compiled ${runtime.provider} provider.`,
    );
  }
  return runtime.createSessionStore({
    defaultMaxAgeSeconds: config.session.maxAgeSeconds,
    env: process.env,
    sweepIntervalMs: config.session.sweepIntervalMs,
  });
}

function registerSessionStoreShutdown(app: NestFastifyApplication, store: BackendSessionStore): void {
  const fastify = app.getHttpAdapter().getInstance() as {
    addHook?: (hook: 'onClose', handler: () => Promise<void> | void) => void;
  };
  fastify.addHook?.('onClose', async () => {
    await store.close();
  });
}

async function registerFastifySession(app: NestFastifyApplication, config: BackendEnvironmentConfig): Promise<void> {
  const runtime = config.session.persistence === 'memory' ? undefined : resolveDurableDatabaseRuntime(app);
  const store = createSessionStore(config, runtime);
  if (store) {
    try {
      await store.init();
      registerSessionStoreShutdown(app, store);
    } catch (error) {
      await store.close();
      throw error;
    }
  }

  const fastify = app.getHttpAdapter().getInstance();
  const sessionOptions: FastifySessionOptions = {
    cookie: {
      httpOnly: true,
      maxAge: config.session.maxAgeSeconds * 1000,
      path: '/',
      sameSite: config.session.sameSite,
      secure: config.session.secure,
    },
    cookieName: config.session.cookieName,
    rolling: true,
    saveUninitialized: false,
    secret: config.session.secret,
    ...(store ? { store } : {}),
  };

  const registerFastifyPlugin = fastify.register.bind(fastify) as FastifyPluginRegister;
  await registerFastifyPlugin(fastifyCookie);
  await registerFastifyPlugin(fastifySession, sessionOptions);
}

function resolveDurableDatabaseRuntime(app: NestFastifyApplication): DurableDatabaseRuntime | undefined {
  try {
    return app.get<DurableDatabaseRuntime>(DurableDatabaseRuntimeInjectToken, { strict: false });
  } catch {
    return undefined;
  }
}

function resolveHost(env: NodeJS.ProcessEnv): string | undefined {
  return readOptionalString(env.HOST);
}

function readConfiguredPort(name: string, value: string | undefined): { name: string; port: number } | undefined {
  const port = readOptionalPositiveInteger(name, value);
  return port === undefined ? undefined : { name, port };
}

interface ResolvedBackendPort {
  name: string;
  port: number;
  source: BackendPortSource;
}

function resolvePort(options: BootstrapNestApiOptions, env: NodeJS.ProcessEnv): ResolvedBackendPort {
  const appPortEnvName = getPortEnvVarName(options.appName);
  const configured = readConfiguredPort(appPortEnvName, env[appPortEnvName]) ?? readConfiguredPort('PORT', env.PORT);

  if (configured) {
    if (configured.port > 65_535) {
      throw new Error(`${configured.name} must be between 1 and 65535.`);
    }
    return {
      name: configured.name,
      port: configured.port,
      source: 'configured',
    };
  }

  if (Number.isInteger(options.port) && options.port >= 1 && options.port <= 65_535) {
    return { name: 'options.port', port: options.port, source: 'configured' };
  }

  throw new Error(
    `No explicit port configured for "${options.appName}". ` +
      `Set ${appPortEnvName} or PORT environment variable, or pass port in options.`,
  );
}

function parseRateLimitStorePreference(value: string | undefined): BackendRateLimitStorePreference {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return 'auto';
  }

  if (normalized === 'auto' || normalized === 'memory' || normalized === 'redis') {
    return normalized;
  }

  throw new Error('RATE_LIMIT_STORE must be one of "auto", "memory", or "redis".');
}

function parseRedisMode(value: string | undefined): RedisMode {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case undefined:
    case '':
    case RedisMode.Single:
      return RedisMode.Single;
    case RedisMode.Sentinel:
      return RedisMode.Sentinel;
    case RedisMode.Cluster:
      return RedisMode.Cluster;
    default:
      throw new Error('REDIS_MODE must be one of "single", "sentinel", or "cluster".');
  }
}

function parseRedisHosts(value: string | undefined): RedisHost[] {
  const trimmed = value?.trim();
  if (!trimmed) {
    return [];
  }

  return trimmed.split(',').map((entry) => {
    const host = entry.trim();
    const [hostName, port = '6379'] = host.split(':');
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

function resolveRedisConnectionConfig(env: NodeJS.ProcessEnv): RedisConnectionConfig | undefined {
  const url = readOptionalString(env.REDIS_URL);
  const hosts = parseRedisHosts(env.REDIS_HOSTS);
  if (!url && hosts.length === 0) {
    return undefined;
  }

  const mode = parseRedisMode(env.REDIS_MODE);
  if ((mode === RedisMode.Cluster || mode === RedisMode.Sentinel) && hosts.length === 0) {
    throw new Error('REDIS_HOSTS is required for cluster or sentinel Redis mode.');
  }

  const sentinelGroupIdentifier = readOptionalString(env.REDIS_SENTINEL_GROUP_IDENTIFIER);
  if (mode === RedisMode.Sentinel && !sentinelGroupIdentifier) {
    throw new Error('REDIS_SENTINEL_GROUP_IDENTIFIER is required for sentinel Redis mode.');
  }

  return {
    mode,
    url,
    hosts,
    password: readOptionalString(env.REDIS_PASSWORD),
    db: readOptionalNonNegativeInteger('REDIS_DB', env.REDIS_DB),
    sentinelGroupIdentifier,
    keyPrefix: readOptionalString(env.REDIS_KEY_PREFIX),
    lazyConnect: true,
  };
}

function resolveRateLimitOptions(
  options: BootstrapNestApiOptions,
  env: NodeJS.ProcessEnv,
  isProduction: boolean,
): BackendEnvironmentConfig['rateLimit'] {
  const enabled =
    options.rateLimit?.enabled ?? readBoolean('RATE_LIMIT_ENABLED', env.RATE_LIMIT_ENABLED) ?? isProduction;
  const storePreference = parseRateLimitStorePreference(env.RATE_LIMIT_STORE);
  const redis = enabled && storePreference !== 'memory' ? resolveRedisConnectionConfig(env) : undefined;

  if (enabled && storePreference === 'redis' && !redis) {
    throw new Error('RATE_LIMIT_STORE=redis requires REDIS_URL or REDIS_HOSTS to be configured.');
  }

  const store: BackendRateLimitStore = enabled && storePreference !== 'memory' && redis ? 'redis' : 'memory';
  const allowProductionMemoryStore =
    readBoolean('RATE_LIMIT_IN_MEMORY_ALLOWED', env.RATE_LIMIT_IN_MEMORY_ALLOWED) ?? false;

  if (enabled && isProduction && store === 'memory' && !allowProductionMemoryStore) {
    throw new Error(
      'Production rate limiting requires RATE_LIMIT_STORE=redis with REDIS_URL or REDIS_HOSTS, or RATE_LIMIT_IN_MEMORY_ALLOWED=true after configuring equivalent ingress/API-gateway limits.',
    );
  }

  return {
    enabled,
    store,
    storePreference,
    redis: store === 'redis' ? redis : undefined,
    max: options.rateLimit?.max ?? readPositiveInteger('RATE_LIMIT_MAX', env.RATE_LIMIT_MAX, DefaultRateLimitMax),
    windowMs:
      options.rateLimit?.windowMs ??
      readPositiveInteger('RATE_LIMIT_WINDOW_MS', env.RATE_LIMIT_WINDOW_MS, DefaultRateLimitWindowMs),
  };
}

export function resolveBackendEnvironmentConfig(
  options: BootstrapNestApiOptions,
  env: NodeJS.ProcessEnv = process.env,
): BackendEnvironmentConfig {
  const isProduction = env.NODE_ENV === 'production';
  const sessionPersistence = resolveSessionPersistence(env);

  const port = resolvePort(options, env);

  return {
    corsOrigins: resolveConfiguredCorsOrigins(options, env),
    host: resolveHost(env),
    isProduction,
    nodeEnv: readOptionalString(env.NODE_ENV),
    port: port.port,
    portSource: port.source,
    rateLimit: resolveRateLimitOptions(options, env, isProduction),
    session: {
      cookieName: resolveSessionCookieName(isProduction, env),
      maxAgeSeconds: readPositiveInteger(
        'SESSION_COOKIE_MAX_AGE_SECONDS',
        env.SESSION_COOKIE_MAX_AGE_SECONDS,
        DefaultSessionCookieMaxAgeSeconds,
      ),
      persistence: sessionPersistence,
      sameSite: resolveSessionCookieSameSite(env),
      secure: resolveSessionCookieSecure(isProduction, env),
      secret: resolveSessionSecret(isProduction, env),
      sweepIntervalMs: readPositiveInteger(
        'SESSION_SWEEP_INTERVAL_MS',
        env.SESSION_SWEEP_INTERVAL_MS,
        DefaultSessionSweepIntervalMs,
      ),
    },
    trustProxy: options.trustProxy ?? readBoolean('TRUST_PROXY', env.TRUST_PROXY) ?? false,
  };
}

export function resolveListenPort(config: BackendEnvironmentConfig): number {
  return config.port;
}

function createRobotsMiddleware() {
  return (request: RequestLike, response: ResponseLike, next: NextFunctionLike) => {
    const path = request.path ?? request.url ?? request.originalUrl;
    if (path === '/robots.txt') {
      response.setHeader('content-type', 'text/plain; charset=utf-8');
      response.end?.('User-agent: *\nDisallow: /\n');
      return;
    }

    next();
  };
}

function createRateLimitStore(rateLimit: BackendEnvironmentConfig['rateLimit']): RateLimitStore {
  if (rateLimit.store === 'redis' && rateLimit.redis) {
    return new RedisRateLimitStore(createRedisClient(rateLimit.redis));
  }

  return new MemoryRateLimitStore();
}

function registerRateLimitStoreShutdown(app: NestFastifyApplication, store: RateLimitStore): void {
  if (!store.close) {
    return;
  }

  const fastify = app.getHttpAdapter().getInstance() as {
    addHook?: (hook: 'onClose', handler: () => Promise<void>) => void;
  };
  fastify.addHook?.('onClose', async () => {
    await store.close?.();
  });
}

function warnAboutRateLimitStore(config: BackendEnvironmentConfig): void {
  if (config.isProduction && config.rateLimit.enabled && config.rateLimit.store === 'memory') {
    process.stderr.write(
      'Production rate limiting is using in-memory per-process storage. ' +
        'Set RATE_LIMIT_STORE=redis with REDIS_URL or REDIS_HOSTS for shared multi-instance enforcement, ' +
        'or enforce equivalent limits at the ingress/API gateway before setting RATE_LIMIT_IN_MEMORY_ALLOWED=true.\n',
    );
  }
}

function sanitizeRateLimitKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]/gu, '_');
}

function buildRateLimitKey(appName: string, request: RequestLike): string {
  const client = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  return `rate-limit:${sanitizeRateLimitKeyPart(appName)}:ip:${sanitizeRateLimitKeyPart(client)}`;
}

function writeProblemResponse(response: ResponseLike, body: ProblemDetailsResponse, locale?: string): void {
  response.statusCode = body.status;
  response.setHeader('content-type', 'application/problem+json; charset=utf-8');
  response.setHeader('vary', mergeVaryHeader(response.getHeader?.('vary')));
  response.setHeader('content-language', resolveProblemContentLanguage(body, locale));
  response.end?.(JSON.stringify(body));
}

function problemInstanceFromRequest(request: RequestLike): string | undefined {
  const requestId = requestContext.getRequestId() ?? normalizeRequestId(request.headers?.['x-request-id']);
  return requestId ? problemInstanceForRequestId(requestId) : undefined;
}

function handleRateLimitHit(
  hit: RateLimitStoreHit,
  rateLimit: BackendEnvironmentConfig['rateLimit'],
  request: RequestLike,
  response: ResponseLike,
  next: NextFunctionLike,
): void {
  const now = Date.now();
  const retryAfterSeconds = Math.max(Math.ceil((hit.resetAt - now) / 1000), 1);
  response.setHeader('x-ratelimit-limit', String(rateLimit.max));
  response.setHeader('x-ratelimit-remaining', String(Math.max(rateLimit.max - hit.count, 0)));
  response.setHeader('x-ratelimit-reset', String(Math.ceil(hit.resetAt / 1000)));

  if (hit.count > rateLimit.max) {
    response.setHeader('retry-after', String(retryAfterSeconds));
    const locale = resolveLocaleFromRequest(request);
    writeProblemResponse(
      response,
      localizeProblemDetails(
        createProblemDetails({
          type: problemTypeForCode('rate-limited'),
          title: 'Too Many Requests',
          status: 429,
          detail: 'Too many requests were received in the current rate-limit window.',
          instance: problemInstanceFromRequest(request),
          extensions: { code: 'rate-limited' },
        }),
        locale,
      ),
      locale,
    );
    return;
  }

  next();
}

function handleRateLimitStoreError(error: unknown, request: RequestLike, response: ResponseLike): void {
  process.stderr.write(
    `${JSON.stringify({
      event: 'rate_limit_store_error',
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  const locale = resolveLocaleFromRequest(request);
  writeProblemResponse(
    response,
    localizeProblemDetails(
      createProblemDetails({
        type: 'about:blank',
        title: 'Service Unavailable',
        status: 503,
        instance: problemInstanceFromRequest(request),
      }),
      locale,
    ),
    locale,
  );
}

function createRateLimitMiddleware(
  appName: string,
  rateLimit: BackendEnvironmentConfig['rateLimit'],
  store: RateLimitStore,
) {
  return (request: RequestLike, response: ResponseLike, next: NextFunctionLike) => {
    const hit = store.increment(buildRateLimitKey(appName, request), rateLimit.windowMs);

    if (hit instanceof Promise) {
      void hit
        .then((resolvedHit) => {
          handleRateLimitHit(resolvedHit, rateLimit, request, response, next);
        })
        .catch((error: unknown) => {
          handleRateLimitStoreError(error, request, response);
        });
      return;
    }

    handleRateLimitHit(hit, rateLimit, request, response, next);
  };
}

export async function bootstrapNestApi(
  module: Type<unknown> | DynamicModule,
  options: BootstrapNestApiOptions,
): Promise<void> {
  initOpenTelemetry({
    serviceName: options.appName,
    serviceVersion: process.env.OTEL_SERVICE_VERSION ?? process.env.npm_package_version,
    environment: process.env.NODE_ENV,
  });
  try {
    await createAndStartNestApi(module, options);
  } catch (error) {
    await shutdownOpenTelemetry();
    throw error;
  }
}

async function createAndStartNestApi(
  module: Type<unknown> | DynamicModule,
  options: BootstrapNestApiOptions,
): Promise<void> {
  const config = resolveBackendEnvironmentConfig(options);
  const app = await NestFactory.create<NestFastifyApplication>(
    withOpenTelemetryLifecycle(module),
    new FastifyAdapter({
      logger: false,
      trustProxy: config.trustProxy,
    }),
    {
      bufferLogs: true,
      rawBody: true,
    },
  );

  // Install the redacting structured logger before buffered logs flush, so every
  // application log passes through StructuredConsoleLogger's redaction instead of
  // Nest's default ConsoleLogger, which would print secrets verbatim.
  const { logger } = createLogger({ name: options.appName });
  app.useLogger(logger);

  app.enableShutdownHooks();
  await registerFastifySession(app, config);
  // CLS: wraps entire async pipeline in AsyncLocalStorage — requestId available everywhere
  app.useGlobalInterceptors(new ClsInterceptor(), new ExceptionsResponseTransformer());
  app.useGlobalFilters(new ExceptionsFilter());
  app.use(createRequestLoggingMiddleware(options.appName));
  app.use(createRobotsMiddleware());
  app.use(createRequestLocaleMiddleware());
  app.use(helmet());
  app.useGlobalPipes(createValidationPipe());

  if (config.rateLimit.enabled) {
    const rateLimitStore = createRateLimitStore(config.rateLimit);
    await rateLimitStore.init?.();
    registerRateLimitStoreShutdown(app, rateLimitStore);
    warnAboutRateLimitStore(config);
    app.use(createRateLimitMiddleware(options.appName, config.rateLimit, rateLimitStore));
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
    authSchemes: options.openApi?.authSchemes,
    description: options.openApi?.description,
    enabled: options.openApi?.enabled,
    path: options.openApi?.path,
    title: options.openApi?.title ?? options.appName,
    version: options.openApi?.version,
  });

  const listenPort = resolveListenPort(config);
  if (config.host) {
    await app.listen(listenPort, config.host);
  } else {
    await app.listen(listenPort);
  }
}
