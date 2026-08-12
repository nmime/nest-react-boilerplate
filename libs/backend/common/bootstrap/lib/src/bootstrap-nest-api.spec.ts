// @requirements REQ-RUNTIME-LIFECYCLE-004
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RedisClientLike } from '@app/backend-common-redis';

const mocks = vi.hoisted(() => {
  const fastifyInstance = {
    addHook: vi.fn(),
    // Fastify's `register(plugin, options)` is called with two args at runtime;
    // type the mock accordingly so call-argument assertions see the options arg.
    register: vi.fn<(plugin: unknown, options?: unknown) => Promise<void>>(() => Promise.resolve()),
  };
  const app = {
    enableCors: vi.fn(),
    enableShutdownHooks: vi.fn(),
    get: vi.fn<(token: unknown, options?: unknown) => unknown>(() => undefined),
    getHttpAdapter: vi.fn(() => ({
      getInstance: () => fastifyInstance,
    })),
    listen: vi.fn(),
    use: vi.fn(),
    useGlobalFilters: vi.fn(),
    useGlobalInterceptors: vi.fn(),
    useGlobalPipes: vi.fn(),
    useLogger: vi.fn(),
  };
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    log: vi.fn(),
    setLogLevels: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  };
  const helmetMiddleware = vi.fn();
  const localeMiddleware = vi.fn();
  const sessionStore = {
    close: vi.fn(() => Promise.resolve()),
    destroy: vi.fn(),
    get: vi.fn(),
    init: vi.fn(() => Promise.resolve()),
    set: vi.fn(),
  };
  const durableRuntime = {
    createSessionStore: vi.fn(() => sessionStore),
    healthIndicators: [],
    provider: 'postgres' as const,
  };
  const redisClient = {
    incrementWithWindow: vi.fn(),
    ping: vi.fn(() => Promise.resolve('PONG')),
  };

  return {
    app,
    closeRedisClient: vi.fn(() => Promise.resolve()),
    createLogger: vi.fn(() => ({ logger, middlewares: [] })),
    createValidationPipe: vi.fn(() => 'validation-pipe'),
    logger,
    createRequestLocaleMiddleware: vi.fn(() => localeMiddleware),
    createRedisClient: vi.fn(() => redisClient),
    fastifyAdapter: vi.fn(function FastifyAdapterMock(options: unknown) {
      return { options };
    }),
    fastifyCookie: vi.fn(),
    fastifyInstance,
    fastifyRegister: fastifyInstance.register,
    fastifySession: vi.fn(),
    helmet: vi.fn(() => helmetMiddleware),
    helmetMiddleware,
    initOpenTelemetry: vi.fn(),
    localeMiddleware,
    mergeVaryHeader: vi.fn((currentValue: unknown) =>
      typeof currentValue === 'string' && currentValue.length > 0
        ? `${currentValue}, Accept-Language, X-Locale, X-Language, Cookie`
        : 'Accept-Language, X-Locale, X-Language, Cookie',
    ),
    nestCreate: vi.fn(() => Promise.resolve(app)),
    durableRuntime,
    sessionStore,
    redisClient,
    exceptionsFilter: vi.fn(function ExceptionsFilterMock() {
      return undefined;
    }),
    exceptionsResponseTransformer: vi.fn(function ExceptionsResponseTransformerMock() {
      return undefined;
    }),
    resolveLocaleFromRequest: vi.fn(() => 'en'),
    setupSwagger: vi.fn(),
    shutdownOpenTelemetry: vi.fn(() => Promise.resolve()),
    translate: vi.fn((key: string) =>
      key === 'errors.rate-limited.title' ? 'Too Many Requests' : 'Too many requests.',
    ),
  };
});

vi.mock('@nestjs/core', () => ({
  NestFactory: { create: mocks.nestCreate },
}));

vi.mock('@nestjs/platform-fastify', () => ({
  FastifyAdapter: mocks.fastifyAdapter,
}));

vi.mock('@fastify/cookie', () => ({
  default: mocks.fastifyCookie,
}));

vi.mock('@fastify/session', () => ({
  default: mocks.fastifySession,
}));

vi.mock('helmet', () => ({
  default: mocks.helmet,
}));

vi.mock('@app/backend-common-redis', () => ({
  closeRedisClient: mocks.closeRedisClient,
  createRedisClient: mocks.createRedisClient,
  RedisMode: {
    Cluster: 'cluster',
    Sentinel: 'sentinel',
    Single: 'single',
  },
}));

vi.mock('@app/backend-common-i18n', () => ({
  createRequestLocaleMiddleware: mocks.createRequestLocaleMiddleware,
  defaultLocale: 'en',
  hasTranslationKey: (key: string) => key.startsWith('errors.rate-limited.'),
  interpolate: (value: string) => value,
  normalizeLocale: (value: string | undefined) => (value === 'en' || value === 'ru' ? value : undefined),
  resolveLocaleFromRequest: mocks.resolveLocaleFromRequest,
  translate: mocks.translate,
  translations: {
    en: { 'errors.rate-limited.title': 'Too Many Requests' },
    ru: { 'errors.rate-limited.title': 'Слишком много запросов' },
  },
}));

vi.mock('@app/backend-common-response', () => ({
  ExceptionsFilter: mocks.exceptionsFilter,
  ExceptionsResponseTransformer: mocks.exceptionsResponseTransformer,
  mergeVaryHeader: mocks.mergeVaryHeader,
}));

vi.mock('@app/backend-common-logger', () => ({
  createLogger: mocks.createLogger,
}));

vi.mock('@app/backend-common-otel', () => ({
  initOpenTelemetry: mocks.initOpenTelemetry,
  shutdownOpenTelemetry: mocks.shutdownOpenTelemetry,
}));

vi.mock('@app/backend-common-swagger', () => ({
  setupSwagger: mocks.setupSwagger,
}));

vi.mock('@app/backend-common-validation', () => ({
  createValidationPipe: mocks.createValidationPipe,
}));

vi.mock('./util/port.util', async (importOriginal) => {
  return await importOriginal<typeof import('./util/port.util')>();
});

import {
  bootstrapNestApi,
  DefaultRequestBodyLimitBytes,
  DurableDatabaseRuntimeInjectToken,
  RedisRateLimitStore,
  resolveBackendEnvironmentConfig,
} from './index';

class TestModule {}

class FakeRedisClient {
  readonly store = new Map<string, { value: string; expireAt: number }>();

  ping(): Promise<string> {
    return Promise.resolve('PONG');
  }

  incrementWithWindow(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    // Mirrors the atomic INCR + PEXPIRE-if-no-TTL contract: a live window keeps
    // its original expiry (INCR never refreshes a TTL) while a fresh counter
    // gets one attached in the same step, so the key always carries an expiry.
    const now = Date.now();
    const existing = this.store.get(key);
    const alive = existing !== undefined && existing.expireAt > now;
    const count = alive ? Number(existing.value) + 1 : 1;
    const resetAt = alive ? existing.expireAt : now + windowMs;
    this.store.set(key, { value: String(count), expireAt: resetAt });
    return Promise.resolve({ count, resetAt });
  }
}

interface TestRequest {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  method?: string;
  originalUrl?: string;
  path?: string;
  socket?: { remoteAddress?: string };
  url?: string;
}

interface TestResponse {
  end?: (body?: string) => void;
  on: (event: 'finish', callback: () => void) => void;
  setHeader: (name: string, value: string) => void;
  statusCode?: number;
}

type TestNext = () => void;
type TestMiddleware = (request: TestRequest, response: TestResponse, next: TestNext) => void;

const createResponse = (): TestResponse => ({
  end: vi.fn(),
  on: vi.fn(),
  setHeader: vi.fn(),
  statusCode: 200,
});

const flushAsyncMiddleware = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

const middlewareAt = (index: number): TestMiddleware => {
  const middleware: unknown = mocks.app.use.mock.calls[index]?.[0];
  if (typeof middleware !== 'function') {
    throw new Error(`Expected middleware at index ${index}.`);
  }

  return middleware as TestMiddleware;
};

const lastMiddleware = (): TestMiddleware => {
  const middleware: unknown = mocks.app.use.mock.calls.at(-1)?.[0];
  if (typeof middleware !== 'function') {
    throw new Error('Expected a middleware to be registered.');
  }

  return middleware as TestMiddleware;
};

describe('bootstrapNestApi', () => {
  const originalEnvironment = {
    authPersistence: process.env.AUTH_PERSISTENCE,
    databaseUrl: process.env.DATABASE_URL,
    host: process.env.HOST,
    nodeEnv: process.env.NODE_ENV as string | undefined,
    mongoDatabase: process.env.MONGODB_DATABASE,
    mongoReplicaSet: process.env.MONGODB_REPLICA_SET,
    mongoUri: process.env.MONGODB_URI,
    npmPackageVersion: process.env.npm_package_version,
    otelServiceVersion: process.env.OTEL_SERVICE_VERSION,
    port: process.env.PORT,
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED,
    rateLimitInMemoryAllowed: process.env.RATE_LIMIT_IN_MEMORY_ALLOWED,
    rateLimitMax: process.env.RATE_LIMIT_MAX,
    rateLimitStore: process.env.RATE_LIMIT_STORE,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
    redisHosts: process.env.REDIS_HOSTS,
    redisMode: process.env.REDIS_MODE,
    redisSentinelGroupIdentifier: process.env.REDIS_SENTINEL_GROUP_IDENTIFIER,
    redisUrl: process.env.REDIS_URL,
    sessionCookieMaxAgeSeconds: process.env.SESSION_COOKIE_MAX_AGE_SECONDS,
    sessionCookieName: process.env.SESSION_COOKIE_NAME,
    sessionCookieSameSite: process.env.SESSION_COOKIE_SAME_SITE,
    sessionCookieSecure: process.env.SESSION_COOKIE_SECURE,
    sessionSecret: process.env.SESSION_SECRET,
    testApiPort: process.env.TEST_API_PORT,
    trustProxy: process.env.TRUST_PROXY,
  };

  beforeEach(() => {
    delete process.env.AUTH_PERSISTENCE;
    delete process.env.DATABASE_URL;
    delete process.env.HOST;
    delete process.env.NODE_ENV;
    delete process.env.MONGODB_DATABASE;
    delete process.env.MONGODB_REPLICA_SET;
    delete process.env.MONGODB_URI;
    delete process.env.npm_package_version;
    delete process.env.OTEL_SERVICE_VERSION;
    delete process.env.PORT;
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_IN_MEMORY_ALLOWED;
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_STORE;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.REDIS_HOSTS;
    delete process.env.REDIS_MODE;
    delete process.env.REDIS_SENTINEL_GROUP_IDENTIFIER;
    delete process.env.REDIS_URL;
    delete process.env.SESSION_COOKIE_MAX_AGE_SECONDS;
    delete process.env.SESSION_COOKIE_NAME;
    delete process.env.SESSION_COOKIE_SAME_SITE;
    delete process.env.SESSION_COOKIE_SECURE;
    delete process.env.SESSION_SECRET;
    delete process.env.TEST_API_PORT;
    delete process.env.TRUST_PROXY;
    vi.clearAllMocks();
    mocks.app.get.mockReturnValue(undefined);
  });

  afterEach(() => {
    process.env.AUTH_PERSISTENCE = originalEnvironment.authPersistence ?? '';
    process.env.DATABASE_URL = originalEnvironment.databaseUrl ?? '';
    process.env.HOST = originalEnvironment.host ?? '';
    process.env.NODE_ENV = originalEnvironment.nodeEnv ?? '';
    process.env.MONGODB_DATABASE = originalEnvironment.mongoDatabase ?? '';
    process.env.MONGODB_REPLICA_SET = originalEnvironment.mongoReplicaSet ?? '';
    process.env.MONGODB_URI = originalEnvironment.mongoUri ?? '';
    process.env.npm_package_version = originalEnvironment.npmPackageVersion ?? '';
    process.env.OTEL_SERVICE_VERSION = originalEnvironment.otelServiceVersion ?? '';
    process.env.PORT = originalEnvironment.port ?? '';
    process.env.RATE_LIMIT_ENABLED = originalEnvironment.rateLimitEnabled ?? '';
    process.env.RATE_LIMIT_IN_MEMORY_ALLOWED = originalEnvironment.rateLimitInMemoryAllowed ?? '';
    process.env.RATE_LIMIT_MAX = originalEnvironment.rateLimitMax ?? '';
    process.env.RATE_LIMIT_STORE = originalEnvironment.rateLimitStore ?? '';
    process.env.RATE_LIMIT_WINDOW_MS = originalEnvironment.rateLimitWindowMs ?? '';
    process.env.REDIS_HOSTS = originalEnvironment.redisHosts ?? '';
    process.env.REDIS_MODE = originalEnvironment.redisMode ?? '';
    process.env.REDIS_SENTINEL_GROUP_IDENTIFIER = originalEnvironment.redisSentinelGroupIdentifier ?? '';
    process.env.REDIS_URL = originalEnvironment.redisUrl ?? '';
    process.env.SESSION_COOKIE_MAX_AGE_SECONDS = originalEnvironment.sessionCookieMaxAgeSeconds ?? '';
    process.env.SESSION_COOKIE_NAME = originalEnvironment.sessionCookieName ?? '';
    process.env.SESSION_COOKIE_SAME_SITE = originalEnvironment.sessionCookieSameSite ?? '';
    process.env.SESSION_COOKIE_SECURE = originalEnvironment.sessionCookieSecure ?? '';
    process.env.SESSION_SECRET = originalEnvironment.sessionSecret ?? '';
    process.env.TEST_API_PORT = originalEnvironment.testApiPort ?? '';
    process.env.TRUST_PROXY = originalEnvironment.trustProxy ?? '';
  });

  it('creates a Fastify app with trust proxy disabled by default', async () => {
    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
    });

    expect(mocks.fastifyAdapter).toHaveBeenCalledWith({
      bodyLimit: DefaultRequestBodyLimitBytes,
      logger: false,
      trustProxy: false,
    });
    expect(mocks.nestCreate).toHaveBeenCalledWith(
      expect.objectContaining({ imports: [TestModule] }),
      expect.anything(),
      { bufferLogs: true, rawBody: true },
    );
    expect(mocks.fastifyRegister).toHaveBeenCalledTimes(2);
    expect(mocks.app.listen).toHaveBeenCalledWith(3010);
  });

  it('initializes OpenTelemetry before creating the Nest application', async () => {
    process.env.NODE_ENV = 'test';
    process.env.OTEL_SERVICE_VERSION = '2.3.4';

    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
    });

    expect(mocks.initOpenTelemetry).toHaveBeenCalledWith({
      serviceName: 'test-api',
      serviceVersion: '2.3.4',
      environment: 'test',
    });
    expect(mocks.initOpenTelemetry.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.nestCreate.mock.invocationCallOrder[0]!,
    );
  });

  it('shuts OpenTelemetry down when Nest application creation fails', async () => {
    mocks.nestCreate.mockRejectedValueOnce(new Error('Nest startup failed'));

    await expect(
      bootstrapNestApi(TestModule, {
        appName: 'test-api',
        port: 3010,
      }),
    ).rejects.toThrow('Nest startup failed');

    expect(mocks.shutdownOpenTelemetry).toHaveBeenCalledOnce();
  });

  it('installs the redacting structured logger so buffered logs are not printed unredacted', async () => {
    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
    });

    expect(mocks.createLogger).toHaveBeenCalledWith({ name: 'test-api' });
    expect(mocks.app.useLogger).toHaveBeenCalledWith(mocks.logger);
  });

  it('honors HOST when binding the API listener', async () => {
    process.env.HOST = '0.0.0.0';

    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
    });

    expect(mocks.app.listen).toHaveBeenCalledWith(3010, '0.0.0.0');
  });

  it('prefers app-specific port environment over generic PORT', async () => {
    process.env.PORT = '4999';
    process.env.TEST_API_PORT = '4123';

    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
    });

    expect(mocks.app.listen).toHaveBeenCalledWith(4123);
  });

  it('registers application Fastify plugins after the shared session plugins', async () => {
    const multipartPlugin = { name: 'multipart' };

    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
      fastifyPlugins: [{ plugin: multipartPlugin, options: { limits: { fileSize: 1024 } } }],
    });

    expect(mocks.fastifyRegister).toHaveBeenCalledTimes(3);
    expect(mocks.fastifyRegister).toHaveBeenLastCalledWith(multipartPlugin, { limits: { fileSize: 1024 } });
  });

  it('applies an application body limit to the Fastify adapter', async () => {
    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
      bodyLimit: 15_728_640,
    });

    expect(mocks.fastifyAdapter).toHaveBeenCalledWith({
      bodyLimit: 15_728_640,
      logger: false,
      trustProxy: false,
    });
  });

  it('passes explicit TRUST_PROXY configuration to Fastify', async () => {
    process.env.TRUST_PROXY = 'true';

    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
    });

    expect(mocks.fastifyAdapter).toHaveBeenCalledWith({
      bodyLimit: DefaultRequestBodyLimitBytes,
      logger: false,
      trustProxy: true,
    });
  });

  it('enables rate limiting by default in production', async () => {
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/app';
    process.env.NODE_ENV = 'production';
    process.env.RATE_LIMIT_IN_MEMORY_ALLOWED = 'true';
    process.env.RATE_LIMIT_MAX = '1';
    process.env.RATE_LIMIT_WINDOW_MS = '1000';
    process.env.SESSION_SECRET = 'x'.repeat(32);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      await bootstrapNestApi(TestModule, {
        appName: 'test-api',
        port: 3010,
      });
      const middleware = lastMiddleware();
      const response = createResponse();
      const next = vi.fn();
      const request = { ip: 'production-client' };

      middleware(request, response, next);
      middleware(request, response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(response.statusCode).toBe(429);
      expect(response.end).toHaveBeenCalledWith(expect.stringContaining('Too Many Requests'));
      expect(response.end).toHaveBeenCalledWith(expect.stringContaining('rate-limited'));
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Production rate limiting'));
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('ignores spoofed x-forwarded-for when deriving rate-limit keys', async () => {
    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
      rateLimit: { enabled: true, max: 1, windowMs: 1_000 },
    });
    const middleware = lastMiddleware();
    const response = createResponse();
    const next = vi.fn();

    const privateClientIp = ['10', '0', '0', '1'].join('.');

    middleware({ headers: { 'x-forwarded-for': 'spoofed-a' }, ip: privateClientIp }, response, next);
    middleware({ headers: { 'x-forwarded-for': 'spoofed-b' }, ip: privateClientIp }, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(429);
  });

  it('delegates durable sessions to the compiled database runtime', async () => {
    process.env.AUTH_PERSISTENCE = 'postgres';
    process.env.SESSION_SECRET = 'x'.repeat(32);
    mocks.app.get.mockReturnValue(mocks.durableRuntime);

    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
    });

    expect(mocks.app.get).toHaveBeenCalledWith(DurableDatabaseRuntimeInjectToken, { strict: false });
    expect(mocks.durableRuntime.createSessionStore).toHaveBeenCalledWith({
      defaultMaxAgeSeconds: 604_800,
      env: process.env,
      sweepIntervalMs: 600_000,
    });
    expect(mocks.sessionStore.init).toHaveBeenCalledOnce();
    expect(mocks.fastifyRegister).toHaveBeenCalledWith(
      mocks.fastifySession,
      expect.objectContaining({ store: mocks.sessionStore }),
    );

    const closeHook = mocks.fastifyInstance.addHook.mock.calls.find((call) => call[0] === 'onClose')?.[1] as
      (() => Promise<void>) | undefined;
    if (!closeHook) {
      throw new Error('Expected the session store to register close.');
    }
    await closeHook();
    expect(mocks.sessionStore.close).toHaveBeenCalledOnce();
  });

  it('does not resolve a durable runtime for in-memory sessions', async () => {
    process.env.AUTH_PERSISTENCE = 'memory';

    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
    });

    expect(mocks.app.get).not.toHaveBeenCalled();
    expect(mocks.fastifyRegister).toHaveBeenCalledWith(
      mocks.fastifySession,
      expect.not.objectContaining({ store: expect.anything() }),
    );
  });

  it('fails closed when the selected durable runtime capability is unavailable', async () => {
    process.env.AUTH_PERSISTENCE = 'postgres';
    mocks.app.get.mockImplementationOnce(() => {
      throw new Error('provider not registered');
    });

    await expect(bootstrapNestApi(TestModule, { appName: 'test-api', port: 3010 })).rejects.toThrow(
      'The selected backend does not include a durable database runtime. Rerun `pnpm nrb setup`.',
    );
    expect(mocks.app.get).toHaveBeenCalledWith(DurableDatabaseRuntimeInjectToken, { strict: false });
  });

  it('rejects an environment selector that differs from the compiled runtime', async () => {
    process.env.AUTH_PERSISTENCE = 'mongodb';
    process.env.SESSION_SECRET = 'x'.repeat(32);
    mocks.app.get.mockReturnValue(mocks.durableRuntime);

    await expect(bootstrapNestApi(TestModule, { appName: 'test-api', port: 3010 })).rejects.toThrow(
      'AUTH_PERSISTENCE=mongodb does not match the compiled postgres provider.',
    );
  });

  it('closes a provider-owned session store when initialization fails', async () => {
    process.env.AUTH_PERSISTENCE = 'postgres';
    mocks.app.get.mockReturnValue(mocks.durableRuntime);
    mocks.sessionStore.init.mockRejectedValueOnce(new Error('initialization failed'));

    await expect(bootstrapNestApi(TestModule, { appName: 'test-api', port: 3010 })).rejects.toThrow(
      'initialization failed',
    );
    expect(mocks.sessionStore.close).toHaveBeenCalledOnce();
  });

  it('validates session, port, and production configuration failures', async () => {
    process.env.SESSION_SECRET = 'short';
    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
    });
    const sessionOptions = mocks.fastifyRegister.mock.calls.at(-1)?.[1] as {
      secret: string;
    };
    expect(sessionOptions.secret).toContain('development-session-padding');

    vi.clearAllMocks();
    process.env.SESSION_SECRET = 'x';
    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
    });
    expect((mocks.fastifyRegister.mock.calls.at(-1)?.[1] as { secret: string }).secret).toHaveLength(32);

    vi.clearAllMocks();
    delete process.env.SESSION_SECRET;
    process.env.PORT = 'abc';
    await expect(bootstrapNestApi(TestModule, { appName: 'test-api', port: 3010 })).rejects.toThrow(
      'PORT must be a positive integer.',
    );

    vi.clearAllMocks();
    process.env.PORT = '70000';
    await expect(bootstrapNestApi(TestModule, { appName: 'test-api', port: 3010 })).rejects.toThrow(
      'PORT must be between 1 and 65535.',
    );

    vi.clearAllMocks();
    delete process.env.PORT;
    process.env.SESSION_COOKIE_SAME_SITE = 'sideways';
    await expect(bootstrapNestApi(TestModule, { appName: 'test-api', port: 3010 })).rejects.toThrow(
      'SESSION_COOKIE_SAME_SITE must be one of "lax", "strict", or "none".',
    );

    vi.clearAllMocks();
    delete process.env.SESSION_COOKIE_SAME_SITE;
    process.env.NODE_ENV = 'production';
    process.env.RATE_LIMIT_IN_MEMORY_ALLOWED = 'true';
    await expect(bootstrapNestApi(TestModule, { appName: 'test-api', port: 3010 })).rejects.toThrow(
      'SESSION_SECRET must be configured in production.',
    );

    vi.clearAllMocks();
    process.env.SESSION_SECRET = 'short';
    process.env.RATE_LIMIT_IN_MEMORY_ALLOWED = 'true';
    await expect(bootstrapNestApi(TestModule, { appName: 'test-api', port: 3010 })).rejects.toThrow(
      'SESSION_SECRET must be at least 32 characters in production.',
    );
  });

  it('covers CORS, request logging, robots, and rate-limit middleware branches', async () => {
    process.env.CORS_ORIGINS = 'https://a.example, https://b.example';
    process.env.SESSION_COOKIE_SECURE = 'true';

    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
    });

    expect(mocks.app.enableCors).toHaveBeenCalledWith({
      origin: ['https://a.example', 'https://b.example'],
      credentials: true,
    });

    const listeners: Array<() => void> = [];
    const response = createResponse();
    response.on = vi.fn((_event: string, listener: unknown) => {
      if (typeof listener === 'function') {
        listeners.push(listener as () => void);
      }
      return response;
    });
    const next = vi.fn();
    middlewareAt(0)(
      {
        headers: { 'x-request-id': ['request-1'] },
        method: 'GET',
        url: '/health',
      },
      response,
      next,
    );
    middlewareAt(0)(
      {
        headers: { 'x-request-id': 'request-2' },
        method: 'POST',
        originalUrl: '/original',
      },
      createResponse(),
      next,
    );
    middlewareAt(0)(
      {
        method: 'PATCH',
        path: '/path-only',
      },
      createResponse(),
      next,
    );
    listeners.forEach((listener) => {
      listener();
    });
    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'request-1');
    expect(next).toHaveBeenCalledTimes(3);
    expect(stdoutWrite).toHaveBeenCalledWith(expect.stringContaining('"requestId":"request-1"'));

    const robotsResponse = createResponse();
    middlewareAt(1)({ path: '/robots.txt' }, robotsResponse, next);
    expect(robotsResponse.setHeader).toHaveBeenCalledWith('content-type', 'text/plain; charset=utf-8');
    expect(robotsResponse.end).toHaveBeenCalledWith('User-agent: *\nDisallow: /\n');
    middlewareAt(1)({ originalUrl: '/not-robots' }, createResponse(), next);

    stdoutWrite.mockRestore();
    vi.clearAllMocks();
    process.env.CORS_ORIGINS = '';
    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      corsOrigins: ['https://direct.example'],
      port: 3010,
    });
    expect(mocks.app.enableCors).toHaveBeenCalledWith({
      origin: ['https://direct.example'],
      credentials: true,
    });

    vi.clearAllMocks();
    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
      enableCors: false,
      rateLimit: { enabled: true, max: 2, windowMs: 1 },
    });
    expect(mocks.app.enableCors).not.toHaveBeenCalled();
    const rateLimitMiddleware = lastMiddleware();
    const socketRequest = { socket: { remoteAddress: 'socket-client' } };
    const firstResponse = createResponse();
    const secondResponse = createResponse();
    const rateNext = vi.fn();
    rateLimitMiddleware(socketRequest, firstResponse, rateNext);
    await new Promise((resolve) => setTimeout(resolve, 2));
    rateLimitMiddleware(socketRequest, secondResponse, rateNext);
    rateLimitMiddleware({}, createResponse(), rateNext);
    expect(rateNext).toHaveBeenCalledTimes(3);
  });

  it('increments through the redis store with an atomic window and stable reset time', async () => {
    const redis = new FakeRedisClient();
    const store = new RedisRateLimitStore(redis as unknown as RedisClientLike);

    const first = await store.increment('rate-key', 5_000);
    const second = await store.increment('rate-key', 5_000);

    expect(first.count).toBe(1);
    expect(second.count).toBe(2);
    // The window reset time is derived from the counter key's own TTL, so it
    // stays fixed across requests instead of sliding forward on every hit.
    expect(second.resetAt).toBe(first.resetAt);
    expect(first.resetAt).toBe(redis.store.get('rate-key')?.expireAt);
    // The counter key carries a TTL that was attached atomically at creation.
    expect(redis.store.get('rate-key')?.expireAt).toBeLessThan(Number.POSITIVE_INFINITY);
    await store.close();
    expect(mocks.closeRedisClient).toHaveBeenCalledWith(redis);
  });

  it('handles async Redis rate-limit hits and store failures', async () => {
    process.env.RATE_LIMIT_STORE = 'redis';
    process.env.REDIS_URL = 'redis://localhost:6379';

    const resetAt = Date.now() + 60_000;
    mocks.redisClient.incrementWithWindow
      .mockResolvedValueOnce({ count: 1, resetAt })
      .mockResolvedValueOnce({ count: 2, resetAt })
      .mockRejectedValueOnce('redis unavailable')
      .mockRejectedValueOnce(new Error('redis exploded'));
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    try {
      await bootstrapNestApi(TestModule, {
        appName: 'test-api',
        port: 3010,
        rateLimit: { enabled: true, max: 1, windowMs: 1_000 },
      });

      expect(mocks.createRedisClient).toHaveBeenCalledWith(
        expect.objectContaining({
          lazyConnect: true,
          mode: 'single',
          url: 'redis://localhost:6379',
        }),
      );
      expect(mocks.fastifyInstance.addHook).toHaveBeenCalledWith('onClose', expect.any(Function));
      const closeHook = mocks.fastifyInstance.addHook.mock.calls.find((call) => call[0] === 'onClose')?.[1] as
        (() => Promise<void>) | undefined;
      if (!closeHook) {
        throw new Error('Expected the Redis rate-limit store to register close.');
      }
      await closeHook();
      expect(mocks.closeRedisClient).toHaveBeenCalledWith(mocks.redisClient);

      const rateLimitMiddleware = lastMiddleware();
      const next = vi.fn();
      const allowedResponse = createResponse();
      rateLimitMiddleware({ ip: 'redis-client' }, allowedResponse, next);
      await flushAsyncMiddleware();
      expect(next).toHaveBeenCalledTimes(1);

      const limitedResponse = createResponse();
      rateLimitMiddleware({ ip: 'redis-client' }, limitedResponse, next);
      await flushAsyncMiddleware();
      expect(limitedResponse.statusCode).toBe(429);
      expect(limitedResponse.end).toHaveBeenCalledWith(expect.stringContaining('rate-limited'));

      const failureResponse = createResponse();
      rateLimitMiddleware({ ip: 'redis-client' }, failureResponse, next);
      await flushAsyncMiddleware();
      expect(failureResponse.statusCode).toBe(503);
      expect(failureResponse.end).toHaveBeenCalledWith(expect.stringContaining('"type":"about:blank"'));
      expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('redis unavailable'));

      const errorFailureResponse = createResponse();
      rateLimitMiddleware({ ip: 'redis-client' }, errorFailureResponse, next);
      await flushAsyncMiddleware();
      expect(errorFailureResponse.statusCode).toBe(503);
      expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('redis exploded'));
    } finally {
      stderrWrite.mockRestore();
    }
  });

  it('validates Redis rate-limit configuration from the environment', () => {
    const baseOptions = { appName: 'test-api', port: 3010 };
    const baseEnvironment = {
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_STORE: 'redis',
    };

    expect(() =>
      resolveBackendEnvironmentConfig(baseOptions, {
        ...baseEnvironment,
        RATE_LIMIT_STORE: 'disk',
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toThrow('RATE_LIMIT_STORE must be one of');

    expect(() =>
      resolveBackendEnvironmentConfig(baseOptions, {
        ...baseEnvironment,
        REDIS_DB: '-1',
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toThrow('REDIS_DB must be a non-negative integer.');

    expect(
      resolveBackendEnvironmentConfig(baseOptions, {
        ...baseEnvironment,
        REDIS_DB: '2',
        REDIS_URL: 'redis://localhost:6379',
      }).rateLimit.redis,
    ).toMatchObject({ db: 2 });

    for (const value of ['1', 'true', 'yes', 'on']) {
      expect(
        resolveBackendEnvironmentConfig(baseOptions, {
          RATE_LIMIT_ENABLED: value,
        }).rateLimit.enabled,
      ).toBe(true);
    }

    for (const value of ['0', 'false', 'no', 'off']) {
      expect(
        resolveBackendEnvironmentConfig(baseOptions, {
          RATE_LIMIT_ENABLED: value,
        }).rateLimit.enabled,
      ).toBe(false);
    }

    expect(() =>
      resolveBackendEnvironmentConfig(baseOptions, {
        ...baseEnvironment,
        REDIS_HOSTS: 'redis.local:not-a-port',
      }),
    ).toThrow('Invalid REDIS_HOSTS entry');

    expect(() =>
      resolveBackendEnvironmentConfig(baseOptions, {
        ...baseEnvironment,
        REDIS_MODE: 'standalone',
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toThrow('REDIS_MODE must be one of');

    expect(() =>
      resolveBackendEnvironmentConfig(baseOptions, {
        ...baseEnvironment,
        REDIS_MODE: 'cluster',
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toThrow('REDIS_HOSTS is required');

    expect(() =>
      resolveBackendEnvironmentConfig(baseOptions, {
        ...baseEnvironment,
        REDIS_HOSTS: 'redis.local:26379',
        REDIS_MODE: 'sentinel',
      }),
    ).toThrow('REDIS_SENTINEL_GROUP_IDENTIFIER is required');
  });

  it('removes expired in-memory rate-limit buckets during periodic cleanup', async () => {
    await bootstrapNestApi(TestModule, {
      appName: 'cleanup-api',
      port: 3010,
      rateLimit: { enabled: true, max: 1_000, windowMs: 1 },
    });

    const rateLimitMiddleware = lastMiddleware();
    rateLimitMiddleware({ ip: 'expired-client' }, createResponse(), vi.fn());
    await new Promise((resolve) => {
      setTimeout(resolve, 2);
    });

    const next = vi.fn();
    for (let index = 0; index < 100; index += 1) {
      rateLimitMiddleware({ ip: `fresh-client-${index}` }, createResponse(), next);
    }

    expect(next).toHaveBeenCalledTimes(100);
  });
});
