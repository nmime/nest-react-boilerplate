import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const fastifyInstance = {
    register: vi.fn(() => Promise.resolve()),
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

  return {
    app,
    createProblemValidationPipe: vi.fn(() => "validation-pipe"),
    createRequestLocaleMiddleware: vi.fn(() => localeMiddleware),
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
    problemExceptionFilter: vi.fn(function ProblemExceptionFilterMock() {
      return undefined;
    }),
    problemResponseTransformer: vi.fn(
      function ProblemResponseTransformerMock() {
        return undefined;
      },
    ),
    resolveLocaleFromRequest: vi.fn(() => "en"),
    setupSwagger: vi.fn(),
    translate: vi.fn((key: string) =>
      key === "errors.too-many-requests.title"
        ? "Too Many Requests"
        : "Too many requests.",
    ),
  };
});

vi.mock("@nestjs/core", () => ({
  NestFactory: { create: mocks.nestCreate },
}));

vi.mock("@nestjs/platform-fastify", () => ({
  FastifyAdapter: mocks.fastifyAdapter,
}));

vi.mock("@fastify/cookie", () => ({
  default: mocks.fastifyCookie,
}));

vi.mock("@fastify/session", () => ({
  default: mocks.fastifySession,
}));

vi.mock("helmet", () => ({
  default: mocks.helmet,
}));

vi.mock("pg", () => ({
  Pool: mocks.Pool,
}));

vi.mock("@app/common/i18n", () => ({
  createRequestLocaleMiddleware: mocks.createRequestLocaleMiddleware,
  resolveLocaleFromRequest: mocks.resolveLocaleFromRequest,
  translate: mocks.translate,
}));

vi.mock("@app/common/response", () => ({
  ProblemExceptionFilter: mocks.problemExceptionFilter,
  ProblemResponseTransformer: mocks.problemResponseTransformer,
}));

vi.mock("@app/common/swagger", () => ({
  setupSwagger: mocks.setupSwagger,
}));

vi.mock("@app/common/validation", () => ({
  createProblemValidationPipe: mocks.createProblemValidationPipe,
}));

import { bootstrapNestApi } from "./index";

class TestModule {}

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
  on: (event: "finish", callback: () => void) => void;
  setHeader: (name: string, value: string) => void;
  statusCode?: number;
}

type TestNext = () => void;
type TestMiddleware = (
  request: TestRequest,
  response: TestResponse,
  next: TestNext,
) => void;

const createResponse = (): TestResponse => ({
  end: vi.fn(),
  on: vi.fn(),
  setHeader: vi.fn(),
  statusCode: 200,
});

interface CapturedStore {
  get: (
    sessionId: string,
    callback: (error: unknown, session?: unknown) => void,
  ) => void;
  set: (
    sessionId: string,
    session: unknown,
    callback: (error?: unknown) => void,
  ) => void;
  destroy: (sessionId: string, callback: (error?: unknown) => void) => void;
}

const middlewareAt = (index: number): TestMiddleware => {
  const middleware: unknown = mocks.app.use.mock.calls[index]?.[0];
  if (typeof middleware !== "function") {
    throw new Error(`Expected middleware at index ${index}.`);
  }

  return middleware as TestMiddleware;
};

const getSessionStore = (): CapturedStore => {
  const options = mocks.fastifyRegister.mock.calls.find(
    (call) => call[1] && typeof call[1] === "object" && "store" in call[1],
  )?.[1] as { store?: CapturedStore } | undefined;
  if (!options?.store) {
    throw new Error("Expected a Fastify session store to be registered.");
  }

  return options.store;
};

const storeGet = (store: CapturedStore, sessionId: string) =>
  new Promise<{ error: unknown; session?: unknown }>((resolve) => {
    store.get(sessionId, (error, session) => resolve({ error, session }));
  });

const storeSet = (store: CapturedStore, sessionId: string, session: unknown) =>
  new Promise<unknown>((resolve) => {
    store.set(sessionId, session, (error) => resolve(error));
  });

const storeDestroy = (store: CapturedStore, sessionId: string) =>
  new Promise<unknown>((resolve) => {
    store.destroy(sessionId, (error) => resolve(error));
  });

const lastMiddleware = (): TestMiddleware => {
  const middleware: unknown = mocks.app.use.mock.calls.at(-1)?.[0];
  if (typeof middleware !== "function") {
    throw new Error("Expected a middleware to be registered.");
  }

  return middleware as TestMiddleware;
};

describe("bootstrapNestApi", () => {
  const originalEnvironment = {
    authJwtSecret: process.env.AUTH_JWT_SECRET,
    databaseUrl: process.env.DATABASE_URL,
    host: process.env.HOST,
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED,
    rateLimitMax: process.env.RATE_LIMIT_MAX,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
    sessionCookieMaxAgeSeconds: process.env.SESSION_COOKIE_MAX_AGE_SECONDS,
    sessionCookieName: process.env.SESSION_COOKIE_NAME,
    sessionCookieSameSite: process.env.SESSION_COOKIE_SAME_SITE,
    sessionCookieSecure: process.env.SESSION_COOKIE_SECURE,
    sessionSecret: process.env.SESSION_SECRET,
    trustProxy: process.env.TRUST_PROXY,
  };

  beforeEach(() => {
    delete process.env.AUTH_JWT_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.HOST;
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.SESSION_COOKIE_MAX_AGE_SECONDS;
    delete process.env.SESSION_COOKIE_NAME;
    delete process.env.SESSION_COOKIE_SAME_SITE;
    delete process.env.SESSION_COOKIE_SECURE;
    delete process.env.SESSION_SECRET;
    delete process.env.TRUST_PROXY;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.AUTH_JWT_SECRET = originalEnvironment.authJwtSecret ?? "";
    process.env.DATABASE_URL = originalEnvironment.databaseUrl ?? "";
    process.env.HOST = originalEnvironment.host ?? "";
    process.env.NODE_ENV = originalEnvironment.nodeEnv ?? "";
    process.env.PORT = originalEnvironment.port ?? "";
    process.env.RATE_LIMIT_ENABLED = originalEnvironment.rateLimitEnabled ?? "";
    process.env.RATE_LIMIT_MAX = originalEnvironment.rateLimitMax ?? "";
    process.env.RATE_LIMIT_WINDOW_MS =
      originalEnvironment.rateLimitWindowMs ?? "";
    process.env.SESSION_COOKIE_MAX_AGE_SECONDS =
      originalEnvironment.sessionCookieMaxAgeSeconds ?? "";
    process.env.SESSION_COOKIE_NAME =
      originalEnvironment.sessionCookieName ?? "";
    process.env.SESSION_COOKIE_SAME_SITE =
      originalEnvironment.sessionCookieSameSite ?? "";
    process.env.SESSION_COOKIE_SECURE =
      originalEnvironment.sessionCookieSecure ?? "";
    process.env.SESSION_SECRET = originalEnvironment.sessionSecret ?? "";
    process.env.TRUST_PROXY = originalEnvironment.trustProxy ?? "";
  });

  it("creates a Fastify app with trust proxy disabled by default", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    expect(mocks.fastifyAdapter).toHaveBeenCalledWith({
      logger: false,
      trustProxy: false,
    });
    expect(mocks.nestCreate).toHaveBeenCalledWith(
      TestModule,
      expect.anything(),
      { bufferLogs: true, rawBody: true },
    );
    expect(mocks.fastifyRegister).toHaveBeenCalledTimes(2);
    expect(mocks.app.listen).toHaveBeenCalledWith(3010);
  });

  it("honors HOST when binding the API listener", async () => {
    process.env.HOST = "0.0.0.0";

    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    expect(mocks.app.listen).toHaveBeenCalledWith(3010, "0.0.0.0");
  });

  it("passes explicit TRUST_PROXY configuration to Fastify", async () => {
    process.env.TRUST_PROXY = "true";

    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    expect(mocks.fastifyAdapter).toHaveBeenCalledWith({
      logger: false,
      trustProxy: true,
    });
  });

  it("enables rate limiting by default in production", async () => {
    process.env.DATABASE_URL =
      "postgres://postgres:postgres@localhost:5432/app";
    process.env.NODE_ENV = "production";
    process.env.RATE_LIMIT_MAX = "1";
    process.env.RATE_LIMIT_WINDOW_MS = "1000";
    process.env.SESSION_SECRET = "x".repeat(32);

    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });
    const middleware = lastMiddleware();
    const response = createResponse();
    const next = vi.fn();
    const request = { ip: "production-client" };

    middleware(request, response, next);
    middleware(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(429);
    expect(response.end).toHaveBeenCalledWith(
      expect.stringContaining("Too Many Requests"),
    );
  });

  it("ignores spoofed x-forwarded-for when deriving rate-limit keys", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
      rateLimit: { enabled: true, max: 1, windowMs: 1_000 },
    });
    const middleware = lastMiddleware();
    const response = createResponse();
    const next = vi.fn();

    const privateClientIp = ["10", "0", "0", "1"].join(".");

    middleware(
      { headers: { "x-forwarded-for": "spoofed-a" }, ip: privateClientIp },
      response,
      next,
    );
    middleware(
      { headers: { "x-forwarded-for": "spoofed-b" }, ip: privateClientIp },
      response,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(429);
  });

  it("persists sessions through the Postgres-backed Fastify session store", async () => {
    process.env.DATABASE_URL =
      "postgres://postgres:postgres@localhost:5432/app";
    process.env.SESSION_SECRET = "x".repeat(32);

    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    const store = getSessionStore();
    expect(mocks.Pool).toHaveBeenCalledWith({
      connectionString: "postgres://postgres:postgres@localhost:5432/app",
    });
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("CREATE TABLE IF NOT EXISTS fastify_sessions"),
    );

    mocks.poolQuery.mockClear();
    const future = new Date(Date.now() + 60_000);
    mocks.poolQuery.mockResolvedValueOnce({
      rows: [
        {
          sess: { cookie: { expires: future.toISOString() }, user: "ada" },
          expire: future.toISOString(),
        },
      ],
    });
    const valid = await storeGet(store, "valid-session");
    expect(valid.error).toBeNull();
    expect(valid.session).toMatchObject({ user: "ada" });
    expect(
      (valid.session as { cookie: { expires: unknown } }).cookie.expires,
    ).toBeInstanceOf(Date);

    mocks.poolQuery.mockResolvedValueOnce({
      rows: [
        {
          sess: { cookie: { expires: future } },
          expire: future,
        },
      ],
    });
    await expect(storeGet(store, "date-cookie-session")).resolves.toMatchObject(
      {
        error: null,
      },
    );

    mocks.poolQuery.mockResolvedValueOnce({
      rows: [
        {
          sess: { cookie: { expires: "not-a-date" } },
          expire: future,
        },
      ],
    });
    await expect(
      storeGet(store, "invalid-cookie-session"),
    ).resolves.toMatchObject({
      error: null,
    });

    mocks.poolQuery.mockResolvedValueOnce({ rows: [] });
    await expect(storeGet(store, "missing-session")).resolves.toEqual({
      error: null,
      session: null,
    });

    mocks.poolQuery
      .mockResolvedValueOnce({
        rows: [{ sess: { cookie: {} }, expire: new Date(Date.now() - 1_000) }],
      })
      .mockResolvedValueOnce({ rows: [] });
    await expect(storeGet(store, "expired-session")).resolves.toEqual({
      error: null,
      session: null,
    });
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      "DELETE FROM fastify_sessions WHERE sid = $1",
      ["expired-session"],
    );

    const getError = new Error("select failed");
    mocks.poolQuery.mockRejectedValueOnce(getError);
    await expect(storeGet(store, "broken-session")).resolves.toEqual({
      error: getError,
      session: undefined,
    });

    mocks.poolQuery.mockResolvedValue({ rows: [] });
    await expect(
      storeSet(store, "date-session", { cookie: { expires: future } }),
    ).resolves.toBeUndefined();
    await expect(
      storeSet(store, "original-max-age-session", {
        cookie: { expires: "not-a-date", originalMaxAge: 1_234 },
      }),
    ).resolves.toBeUndefined();
    await expect(
      storeSet(store, "max-age-session", { cookie: { maxAge: 2_345 } }),
    ).resolves.toBeUndefined();
    await expect(
      storeSet(store, "fallback-session", {}),
    ).resolves.toBeUndefined();

    const setError = new Error("insert failed");
    mocks.poolQuery.mockRejectedValueOnce(setError);
    await expect(storeSet(store, "broken-set", {})).resolves.toBe(setError);

    mocks.poolQuery.mockResolvedValueOnce({ rows: [] });
    await expect(
      storeDestroy(store, "delete-session"),
    ).resolves.toBeUndefined();
    const destroyError = new Error("delete failed");
    mocks.poolQuery.mockRejectedValueOnce(destroyError);
    await expect(storeDestroy(store, "broken-delete")).resolves.toBe(
      destroyError,
    );
  });

  it("validates session, port, and production configuration failures", async () => {
    process.env.SESSION_SECRET = "short";
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });
    const sessionOptions = mocks.fastifyRegister.mock.calls.at(-1)?.[1] as {
      secret: string;
    };
    expect(sessionOptions.secret).toContain("development-session-padding");

    vi.clearAllMocks();
    process.env.SESSION_SECRET = "x";
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });
    expect(
      (mocks.fastifyRegister.mock.calls.at(-1)?.[1] as { secret: string })
        .secret,
    ).toHaveLength(32);

    vi.clearAllMocks();
    delete process.env.SESSION_SECRET;
    process.env.PORT = "abc";
    await expect(
      bootstrapNestApi(TestModule, { appName: "test-api", defaultPort: 3010 }),
    ).rejects.toThrow("PORT must be a positive integer.");

    vi.clearAllMocks();
    process.env.PORT = "70000";
    await expect(
      bootstrapNestApi(TestModule, { appName: "test-api", defaultPort: 3010 }),
    ).rejects.toThrow("PORT must be between 1 and 65535.");

    vi.clearAllMocks();
    delete process.env.PORT;
    process.env.SESSION_COOKIE_SAME_SITE = "sideways";
    await expect(
      bootstrapNestApi(TestModule, { appName: "test-api", defaultPort: 3010 }),
    ).rejects.toThrow(
      'SESSION_COOKIE_SAME_SITE must be one of "lax", "strict", or "none".',
    );

    vi.clearAllMocks();
    delete process.env.SESSION_COOKIE_SAME_SITE;
    process.env.NODE_ENV = "production";
    await expect(
      bootstrapNestApi(TestModule, { appName: "test-api", defaultPort: 3010 }),
    ).rejects.toThrow(
      "DATABASE_URL must be configured in production for server-side sessions.",
    );

    vi.clearAllMocks();
    process.env.DATABASE_URL =
      "postgres://postgres:postgres@localhost:5432/app";
    await expect(
      bootstrapNestApi(TestModule, { appName: "test-api", defaultPort: 3010 }),
    ).rejects.toThrow(
      "SESSION_SECRET or AUTH_JWT_SECRET must be configured in production.",
    );

    vi.clearAllMocks();
    process.env.SESSION_SECRET = "short";
    await expect(
      bootstrapNestApi(TestModule, { appName: "test-api", defaultPort: 3010 }),
    ).rejects.toThrow(
      "SESSION_SECRET or AUTH_JWT_SECRET must be at least 32 characters in production.",
    );
  });

  it("covers CORS, request logging, robots, and rate-limit middleware branches", async () => {
    process.env.CORS_ORIGINS = "https://a.example, https://b.example";
    process.env.SESSION_COOKIE_SECURE = "true";

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    expect(mocks.app.enableCors).toHaveBeenCalledWith({
      origin: ["https://a.example", "https://b.example"],
      credentials: true,
    });

    const listeners: Array<() => void> = [];
    const response = createResponse();
    response.on = vi.fn((_event: string, listener: unknown) => {
      if (typeof listener === "function") {
        listeners.push(listener as () => void);
      }
      return response;
    });
    const next = vi.fn();
    middlewareAt(0)(
      {
        headers: { "x-request-id": ["request-1"] },
        method: "GET",
        url: "/health",
      },
      response,
      next,
    );
    middlewareAt(0)(
      {
        headers: { "x-request-id": "request-2" },
        method: "POST",
        originalUrl: "/original",
      },
      createResponse(),
      next,
    );
    middlewareAt(0)(
      {
        method: "PATCH",
        path: "/path-only",
      },
      createResponse(),
      next,
    );
    listeners.forEach((listener) => listener());
    expect(response.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      "request-1",
    );
    expect(next).toHaveBeenCalledTimes(3);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('"requestId":"request-1"'),
    );

    const robotsResponse = createResponse();
    middlewareAt(1)({ path: "/robots.txt" }, robotsResponse, next);
    expect(robotsResponse.setHeader).toHaveBeenCalledWith(
      "content-type",
      "text/plain; charset=utf-8",
    );
    expect(robotsResponse.end).toHaveBeenCalledWith(
      "User-agent: *\nDisallow: /\n",
    );
    middlewareAt(1)({ originalUrl: "/not-robots" }, createResponse(), next);

    logSpy.mockRestore();
    vi.clearAllMocks();
    process.env.CORS_ORIGINS = "";
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      corsOrigins: ["https://direct.example"],
      defaultPort: 3010,
    });
    expect(mocks.app.enableCors).toHaveBeenCalledWith({
      origin: ["https://direct.example"],
      credentials: true,
    });

    vi.clearAllMocks();
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
      enableCors: false,
      rateLimit: { enabled: true, max: 2, windowMs: 1 },
    });
    expect(mocks.app.enableCors).not.toHaveBeenCalled();
    const rateLimitMiddleware = lastMiddleware();
    const socketRequest = { socket: { remoteAddress: "socket-client" } };
    const firstResponse = createResponse();
    const secondResponse = createResponse();
    const rateNext = vi.fn();
    rateLimitMiddleware(socketRequest, firstResponse, rateNext);
    await new Promise((resolve) => setTimeout(resolve, 2));
    rateLimitMiddleware(socketRequest, secondResponse, rateNext);
    rateLimitMiddleware({}, createResponse(), rateNext);
    expect(rateNext).toHaveBeenCalledTimes(3);
  });
});
