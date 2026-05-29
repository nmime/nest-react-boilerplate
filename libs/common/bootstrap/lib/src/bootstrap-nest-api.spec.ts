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
});
