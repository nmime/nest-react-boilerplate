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
    getHttpAdapter: vi.fn(() => ({
      getInstance: () => fastifyInstance,
    })),
    listen: vi.fn(),
    use: vi.fn(),
    useGlobalFilters: vi.fn(),
    useGlobalInterceptors: vi.fn(),
    useGlobalPipes: vi.fn(),
  };
  const helmetMiddleware = vi.fn();
  const localeMiddleware = vi.fn();
  const poolQuery = vi.fn(() => Promise.resolve({ rows: [] }));
  const redisClient = {
    incrementWithWindow: vi.fn(),
    ping: vi.fn(() => Promise.resolve('PONG')),
  };

  return {
    app,
    closeRedisClient: vi.fn(() => Promise.resolve()),
    createValidationPipe: vi.fn(() => 'validation-pipe'),
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
    localeMiddleware,
    nestCreate: vi.fn(() => Promise.resolve(app)),
    poolQuery,
    Pool: vi.fn(function PoolMock() {
      return { query: poolQuery };
    }),
    redisClient,
    exceptionsFilter: vi.fn(function ExceptionsFilterMock() {
      return undefined;
    }),
    exceptionsResponseTransformer: vi.fn(function ExceptionsResponseTransformerMock() {
      return undefined;
    }),
    resolveLocaleFromRequest: vi.fn(() => 'en'),
    setupSwagger: vi.fn(),
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

vi.mock('pg', () => ({
  Pool: mocks.Pool,
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

vi.mock('@app/common-i18n', () => ({
  createRequestLocaleMiddleware: mocks.createRequestLocaleMiddleware,
  resolveLocaleFromRequest: mocks.resolveLocaleFromRequest,
  translate: mocks.translate,
}));

vi.mock('@app/backend-common-response', () => ({
  ExceptionsFilter: mocks.exceptionsFilter,
  ExceptionsResponseTransformer: mocks.exceptionsResponseTransformer,
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

import { bootstrapNestApi, RedisRateLimitStore, resolveBackendEnvironmentConfig } from './index';

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

interface CapturedStore {
  get: (sessionId: string, callback: (error: unknown, session?: unknown) => void) => void;
  set: (sessionId: string, session: unknown, callback: (error?: unknown) => void) => void;
  destroy: (sessionId: string, callback: (error?: unknown) => void) => void;
}

const middlewareAt = (index: number): TestMiddleware => {
  const middleware: unknown = mocks.app.use.mock.calls[index]?.[0];
  if (typeof middleware !== 'function') {
    throw new Error(`Expected middleware at index ${index}.`);
  }

  return middleware as TestMiddleware;
};

const getSessionStore = (): CapturedStore => {
  const options = mocks.fastifyRegister.mock.calls.find(
    (call) => call[1] && typeof call[1] === 'object' && 'store' in call[1],
  )?.[1] as { store?: CapturedStore } | undefined;
  if (!options?.store) {
    throw new Error('Expected a Fastify session store to be registered.');
  }

  return options.store;
};

const storeGet = (store: CapturedStore, sessionId: string) =>
  new Promise<{ error: unknown; session?: unknown }>((resolve) => {
    store.get(sessionId, (error, session) => {
      resolve({ error, session });
    });
  });

const storeSet = (store: CapturedStore, sessionId: string, session: unknown) =>
  new Promise<unknown>((resolve) => {
    store.set(sessionId, session, (error) => {
      resolve(error);
    });
  });

const storeDestroy = (store: CapturedStore, sessionId: string) =>
  new Promise<unknown>((resolve) => {
    store.destroy(sessionId, (error) => {
      resolve(error);
    });
  });

const lastMiddleware = (): TestMiddleware => {
  const middleware: unknown = mocks.app.use.mock.calls.at(-1)?.[0];
  if (typeof middleware !== 'function') {
    throw new Error('Expected a middleware to be registered.');
  }

  return middleware as TestMiddleware;
};

describe('bootstrapNestApi', () => {
  const originalEnvironment = {
    authJwtSecret: process.env.AUTH_JWT_SECRET,
    databaseUrl: process.env.DATABASE_URL,
    host: process.env.HOST,
    nodeEnv: process.env.NODE_ENV as string | undefined,
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
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.HOST;
    delete process.env.NODE_ENV;
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
  });

  afterEach(() => {
    process.env.AUTH_JWT_SECRET = originalEnvironment.authJwtSecret ?? '';
    process.env.DATABASE_URL = originalEnvironment.databaseUrl ?? '';
    process.env.HOST = originalEnvironment.host ?? '';
    process.env.NODE_ENV = originalEnvironment.nodeEnv ?? '';
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
      logger: false,
      trustProxy: false,
    });
    expect(mocks.nestCreate).toHaveBeenCalledWith(TestModule, expect.anything(), { bufferLogs: true, rawBody: true });
    expect(mocks.fastifyRegister).toHaveBeenCalledTimes(2);
    expect(mocks.app.listen).toHaveBeenCalledWith(3010);
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

  it('passes explicit TRUST_PROXY configuration to Fastify', async () => {
    process.env.TRUST_PROXY = 'true';

    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
    });

    expect(mocks.fastifyAdapter).toHaveBeenCalledWith({
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

  it('persists sessions through the Postgres-backed Fastify session store', async () => {
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/app';
    process.env.SESSION_SECRET = 'x'.repeat(32);

    await bootstrapNestApi(TestModule, {
      appName: 'test-api',
      port: 3010,
    });

    const store = getSessionStore();
    expect(mocks.Pool).toHaveBeenCalledWith({
      connectionString: 'postgres://postgres:postgres@localhost:5432/app',
    });
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS fastify_sessions'),
    );

    mocks.poolQuery.mockClear();
    const future = new Date(Date.now() + 60_000);
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [
        {
          sess: { cookie: { expires: future.toISOString() }, user: 'ada' },
          expire: future.toISOString(),
        },
      ],
    });
    const valid = await storeGet(store, 'valid-session');
    expect(valid.error).toBeNull();
    expect(valid.session).toMatchObject({ user: 'ada' });
    expect((valid.session as { cookie: { expires: unknown } }).cookie.expires).toBeInstanceOf(Date);

    mocks.poolQuery.mockResolvedValueOnce({
      rows: [
        {
          sess: { cookie: { expires: future } },
          expire: future,
        },
      ],
    });
    await expect(storeGet(store, 'date-cookie-session')).resolves.toMatchObject({
      error: null,
    });

    mocks.poolQuery.mockResolvedValueOnce({
      rows: [
        {
          sess: { cookie: { expires: 'not-a-date' } },
          expire: future,
        },
      ],
    });
    await expect(storeGet(store, 'invalid-cookie-session')).resolves.toMatchObject({
      error: null,
    });

    mocks.poolQuery.mockResolvedValueOnce({ rows: [] });
    await expect(storeGet(store, 'missing-session')).resolves.toEqual({
      error: null,
      session: null,
    });

    mocks.poolQuery
      .mockResolvedValueOnce({
        rows: [{ sess: { cookie: {} }, expire: new Date(Date.now() - 1_000) }],
      })
      .mockResolvedValueOnce({ rows: [] });
    await expect(storeGet(store, 'expired-session')).resolves.toEqual({
      error: null,
      session: null,
    });
    expect(mocks.poolQuery).toHaveBeenCalledWith('DELETE FROM fastify_sessions WHERE sid = $1', ['expired-session']);

    const getError = new Error('select failed');
    mocks.poolQuery.mockRejectedValueOnce(getError);
    await expect(storeGet(store, 'broken-session')).resolves.toEqual({
      error: getError,
      session: undefined,
    });

    mocks.poolQuery.mockResolvedValue({ rows: [] });
    await expect(storeSet(store, 'date-session', { cookie: { expires: future } })).resolves.toBeUndefined();
    await expect(
      storeSet(store, 'original-max-age-session', {
        cookie: { expires: 'not-a-date', originalMaxAge: 1_234 },
      }),
    ).resolves.toBeUndefined();
    await expect(storeSet(store, 'max-age-session', { cookie: { maxAge: 2_345 } })).resolves.toBeUndefined();
    await expect(storeSet(store, 'fallback-session', {})).resolves.toBeUndefined();

    const setError = new Error('insert failed');
    mocks.poolQuery.mockRejectedValueOnce(setError);
    await expect(storeSet(store, 'broken-set', {})).resolves.toBe(setError);

    mocks.poolQuery.mockResolvedValueOnce({ rows: [] });
    await expect(storeDestroy(store, 'delete-session')).resolves.toBeUndefined();
    const destroyError = new Error('delete failed');
    mocks.poolQuery.mockRejectedValueOnce(destroyError);
    await expect(storeDestroy(store, 'broken-delete')).resolves.toBe(destroyError);

    const closeHook = mocks.fastifyInstance.addHook.mock.calls.find((call) => call[0] === 'onClose')?.[1] as
      (() => Promise<void>) | undefined;
    if (!closeHook) {
      throw new Error('Expected the session store to register close.');
    }
    await closeHook();
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
    await expect(bootstrapNestApi(TestModule, { appName: 'test-api', port: 3010 })).rejects.toThrow(
      'DATABASE_URL must be configured in production for server-side sessions.',
    );

    vi.clearAllMocks();
    delete process.env.SESSION_COOKIE_SAME_SITE;
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/app';
    process.env.RATE_LIMIT_IN_MEMORY_ALLOWED = 'true';
    await expect(bootstrapNestApi(TestModule, { appName: 'test-api', port: 3010 })).rejects.toThrow(
      'SESSION_SECRET or AUTH_JWT_SECRET must be configured in production.',
    );

    vi.clearAllMocks();
    process.env.SESSION_SECRET = 'short';
    process.env.RATE_LIMIT_IN_MEMORY_ALLOWED = 'true';
    await expect(bootstrapNestApi(TestModule, { appName: 'test-api', port: 3010 })).rejects.toThrow(
      'SESSION_SECRET or AUTH_JWT_SECRET must be at least 32 characters in production.',
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
      expect(failureResponse.end).toHaveBeenCalledWith(expect.stringContaining('rate-limit-unavailable'));
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

  it('sweeps expired sessions on an interval and stops the sweep on shutdown', async () => {
    process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/app';
    process.env.SESSION_SECRET = 'x'.repeat(32);
    process.env.SESSION_SWEEP_INTERVAL_MS = '1000';
    vi.useFakeTimers();

    try {
      await bootstrapNestApi(TestModule, {
        appName: 'test-api',
        port: 3010,
      });
      const store = getSessionStore() as unknown as {
        close: () => Promise<void>;
        init: () => Promise<void>;
      };

      await store.init();
      mocks.poolQuery.mockClear();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(mocks.poolQuery).toHaveBeenCalledWith('DELETE FROM fastify_sessions WHERE expire <= $1', [
        expect.any(Date),
      ]);

      await store.close();
      await store.close();
      mocks.poolQuery.mockClear();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(mocks.poolQuery).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      delete process.env.SESSION_SWEEP_INTERVAL_MS;
    }
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
