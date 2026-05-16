import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const app = {
    enableCors: vi.fn(),
    enableShutdownHooks: vi.fn(),
    listen: vi.fn(),
    set: vi.fn(),
    use: vi.fn(),
    useGlobalFilters: vi.fn(),
    useGlobalInterceptors: vi.fn(),
    useGlobalPipes: vi.fn(),
  };
  const cookieMiddleware = vi.fn();
  const helmetMiddleware = vi.fn();
  return {
    app,
    cookieParser: vi.fn(() => cookieMiddleware),
    cookieMiddleware,
    createProblemValidationPipe: vi.fn(() => "validation-pipe"),
    helmet: vi.fn(() => helmetMiddleware),
    helmetMiddleware,
    nestCreate: vi.fn(() => Promise.resolve(app)),
    problemExceptionFilter: vi.fn(function ProblemExceptionFilterMock() {
      return undefined;
    }),
    problemResponseTransformer: vi.fn(
      function ProblemResponseTransformerMock() {
        return undefined;
      },
    ),
    setupSwagger: vi.fn(),
  };

  it("continues non-robots requests", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });
    const middleware = mocks.app.use.mock.calls[1][0] as TestMiddleware;
    const next = vi.fn();

    middleware(
      { url: "/health" },
      { end: vi.fn(), on: vi.fn(), setHeader: vi.fn() },
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it("generates request ids and prefers originalUrl in structured logs", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });
    const middleware = mocks.app.use.mock.calls[0][0] as TestMiddleware;
    const finishCallbacks: Array<() => void> = [];
    const response = {
      on: vi.fn((_: "finish", callback: () => void) =>
        finishCallbacks.push(callback),
      ),
      setHeader: vi.fn(),
      statusCode: 200,
    };

    middleware({ method: "POST", originalUrl: "/original" }, response, vi.fn());
    finishCallbacks[0]();

    expect(response.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      expect.any(String),
    );
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toMatchObject({
      path: "/original",
      status: 200,
    });
  });

  it("enables rate limiting from environment configuration", async () => {
    process.env.RATE_LIMIT_ENABLED = "on";
    process.env.RATE_LIMIT_MAX = "2";
    process.env.RATE_LIMIT_WINDOW_MS = "1000";

    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    expect(mocks.app.use).toHaveBeenCalledWith(expect.any(Function));
  });

  it("uses forwarded, socket, and unknown clients for rate-limit keys", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
      rateLimit: { enabled: true, max: 10, windowMs: 1_000 },
    });
    const middleware = mocks.app.use.mock.calls.at(-1)?.[0] as TestMiddleware;
    const response = {
      end: vi.fn(),
      on: vi.fn(),
      setHeader: vi.fn(),
      statusCode: 200,
    };
    const next = vi.fn();

    middleware({ headers: { "x-forwarded-for": "client-a" } }, response, next);
    middleware({ socket: { remoteAddress: "client-b" } }, response, next);
    middleware({}, response, next);

    expect(next).toHaveBeenCalledTimes(3);
  });

  it("uses request.path in logs and originalUrl for robots fallback", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });
    const loggingMiddleware = mocks.app.use.mock.calls[0][0] as TestMiddleware;
    const robotsMiddleware = mocks.app.use.mock.calls[1][0] as TestMiddleware;
    const finishCallbacks: Array<() => void> = [];
    const logResponse = {
      on: vi.fn((_: "finish", callback: () => void) =>
        finishCallbacks.push(callback),
      ),
      setHeader: vi.fn(),
      statusCode: 200,
    };
    const robotsResponse = {
      end: vi.fn(),
      on: vi.fn(),
      setHeader: vi.fn(),
    };

    loggingMiddleware({ path: "/path-only" }, logResponse, vi.fn());
    finishCallbacks[0]();
    robotsMiddleware({ originalUrl: "/robots.txt" }, robotsResponse, vi.fn());

    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toMatchObject({
      path: "/path-only",
    });
    expect(robotsResponse.end).toHaveBeenCalledWith(
      "User-agent: *\nDisallow: /\n",
    );
  });
});

vi.mock("@nestjs/core", () => ({
  NestFactory: { create: mocks.nestCreate },
}));

vi.mock("cookie-parser", () => ({
  default: mocks.cookieParser,
}));

vi.mock("helmet", () => ({
  default: mocks.helmet,
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

const restoreEnv = (name: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
};

describe("bootstrapNestApi", () => {
  const originalEnvironment = {
    cookieSecret: process.env.COOKIE_SECRET,
    corsOrigin: process.env.CORS_ORIGIN,
    corsOrigins: process.env.CORS_ORIGINS,
    nodeEnv: process.env.NODE_ENV,
    openApiDescription: process.env.OPENAPI_DESCRIPTION,
    openApiEnabled: process.env.OPENAPI_ENABLED,
    openApiPath: process.env.OPENAPI_PATH,
    openApiTitle: process.env.OPENAPI_TITLE,
    openApiVersion: process.env.OPENAPI_VERSION,
    port: process.env.PORT,
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED,
    rateLimitMax: process.env.RATE_LIMIT_MAX,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
    trustProxy: process.env.TRUST_PROXY,
  };

  beforeEach(() => {
    delete process.env.COOKIE_SECRET;
    delete process.env.CORS_ORIGIN;
    delete process.env.CORS_ORIGINS;
    delete process.env.NODE_ENV;
    delete process.env.OPENAPI_DESCRIPTION;
    delete process.env.OPENAPI_ENABLED;
    delete process.env.OPENAPI_PATH;
    delete process.env.OPENAPI_TITLE;
    delete process.env.OPENAPI_VERSION;
    delete process.env.PORT;
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.TRUST_PROXY;
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv("COOKIE_SECRET", originalEnvironment.cookieSecret);
    restoreEnv("CORS_ORIGIN", originalEnvironment.corsOrigin);
    restoreEnv("CORS_ORIGINS", originalEnvironment.corsOrigins);
    restoreEnv("NODE_ENV", originalEnvironment.nodeEnv);
    restoreEnv("OPENAPI_DESCRIPTION", originalEnvironment.openApiDescription);
    restoreEnv("OPENAPI_ENABLED", originalEnvironment.openApiEnabled);
    restoreEnv("OPENAPI_PATH", originalEnvironment.openApiPath);
    restoreEnv("OPENAPI_TITLE", originalEnvironment.openApiTitle);
    restoreEnv("OPENAPI_VERSION", originalEnvironment.openApiVersion);
    restoreEnv("PORT", originalEnvironment.port);
    restoreEnv("RATE_LIMIT_ENABLED", originalEnvironment.rateLimitEnabled);
    restoreEnv("RATE_LIMIT_MAX", originalEnvironment.rateLimitMax);
    restoreEnv("RATE_LIMIT_WINDOW_MS", originalEnvironment.rateLimitWindowMs);
    restoreEnv("TRUST_PROXY", originalEnvironment.trustProxy);
  });

  it("creates an app with xRocket-style HTTP foundation and the default port", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    expect(mocks.nestCreate).toHaveBeenCalledWith(TestModule, {
      bufferLogs: true,
      rawBody: true,
    });
    expect(mocks.app.set).toHaveBeenCalledWith("query parser", "extended");
    expect(mocks.app.set).toHaveBeenCalledWith("trust proxy", false);
    expect(mocks.app.enableShutdownHooks).toHaveBeenCalledOnce();
    expect(mocks.app.use).toHaveBeenNthCalledWith(1, expect.any(Function));
    expect(mocks.app.use).toHaveBeenNthCalledWith(2, expect.any(Function));
    expect(mocks.cookieParser).toHaveBeenCalledWith(undefined);
    expect(mocks.app.use).toHaveBeenCalledWith(mocks.cookieMiddleware);
    expect(mocks.helmet).toHaveBeenCalledOnce();
    expect(mocks.app.use).toHaveBeenCalledWith(mocks.helmetMiddleware);
    expect(mocks.createProblemValidationPipe).toHaveBeenCalledOnce();
    expect(mocks.app.useGlobalPipes).toHaveBeenCalledWith("validation-pipe");
    expect(mocks.problemResponseTransformer).toHaveBeenCalledWith();
    expect(mocks.app.useGlobalInterceptors).toHaveBeenCalledWith(
      expect.anything(),
    );
    expect(mocks.problemExceptionFilter).toHaveBeenCalledWith();
    expect(mocks.app.useGlobalFilters).toHaveBeenCalledWith(expect.anything());
    expect(mocks.app.enableCors).toHaveBeenCalledWith({
      credentials: true,
      origin: true,
    });
    expect(mocks.setupSwagger).toHaveBeenCalledWith(mocks.app, {
      description: undefined,
      enabled: undefined,
      path: undefined,
      title: "test-api",
      version: undefined,
    });
    expect(mocks.app.listen).toHaveBeenCalledWith(3010);
  });

  it("uses explicit CORS origins before environment origins and honors a PORT override", async () => {
    process.env.CORS_ORIGINS = "https://ignored.example";
    process.env.PORT = "4111";

    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      corsOrigins: ["https://app.example"],
      defaultPort: 3010,
    });

    expect(mocks.app.enableCors).toHaveBeenCalledWith({
      credentials: true,
      origin: ["https://app.example"],
    });
    expect(mocks.app.listen).toHaveBeenCalledWith(4111);
  });

  it("uses comma-separated CORS_ORIGINS and CORS_ORIGIN values", async () => {
    process.env.CORS_ORIGINS =
      " , https://admin.example, https://app.example, ";
    process.env.CORS_ORIGIN = "https://landing.example";

    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    expect(mocks.app.enableCors).toHaveBeenCalledWith({
      credentials: true,
      origin: [
        "https://admin.example",
        "https://app.example",
        "https://landing.example",
      ],
    });
  });

  it("does not reflect arbitrary origins in production without explicit origins", async () => {
    process.env.NODE_ENV = "production";

    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    expect(mocks.app.enableCors).not.toHaveBeenCalled();
    expect(mocks.app.listen).toHaveBeenCalledWith(3010);
  });

  it("can skip CORS setup", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
      enableCors: false,
    });

    expect(mocks.app.enableCors).not.toHaveBeenCalled();
    expect(mocks.app.listen).toHaveBeenCalledWith(3010);
  });

  it("rejects invalid PORT values with a clear error", async () => {
    process.env.PORT = "not-a-port";

    await expect(
      bootstrapNestApi(TestModule, { appName: "test-api", defaultPort: 3010 }),
    ).rejects.toThrow("PORT must be a positive integer.");
  });

  it("rejects PORT values outside the TCP port range", async () => {
    process.env.PORT = "70000";

    await expect(
      bootstrapNestApi(TestModule, { appName: "test-api", defaultPort: 3010 }),
    ).rejects.toThrow("PORT must be between 1 and 65535.");
  });

  it("sets or preserves request ids and writes structured completion logs", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });
    const middleware = mocks.app.use.mock.calls[0][0] as TestMiddleware;
    const finishCallbacks: Array<() => void> = [];
    const response = {
      on: vi.fn((_: "finish", callback: () => void) =>
        finishCallbacks.push(callback),
      ),
      setHeader: vi.fn(),
      statusCode: 204,
    };

    middleware(
      {
        headers: { "x-request-id": ["request-id", "ignored-request-id"] },
        method: "GET",
        url: "/health",
      },
      response,
      vi.fn(),
    );
    finishCallbacks[0]();

    expect(response.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      "request-id",
    );
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toMatchObject({
      appName: "test-api",
      method: "GET",
      path: "/health",
      requestId: "request-id",
      status: 204,
    });
  });

  it("serves deny-all robots.txt before app routes", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });
    const middleware = mocks.app.use.mock.calls[1][0] as TestMiddleware;
    const response = {
      end: vi.fn(),
      on: vi.fn(),
      setHeader: vi.fn(),
    };
    const next = vi.fn();

    middleware({ path: "/robots.txt" }, response, next);

    expect(response.setHeader).toHaveBeenCalledWith(
      "content-type",
      "text/plain; charset=utf-8",
    );
    expect(response.end).toHaveBeenCalledWith("User-agent: *\nDisallow: /\n");
    expect(next).not.toHaveBeenCalled();
  });

  it("supports rate limiting with problem-details responses", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
      rateLimit: { enabled: true, max: 1, windowMs: 1_000 },
    });
    const middleware = mocks.app.use.mock.calls.at(-1)?.[0] as TestMiddleware;
    const response = {
      end: vi.fn(),
      on: vi.fn(),
      setHeader: vi.fn(),
      statusCode: 200,
    };
    const request = { ip: "127.0.0.1" };

    middleware(request, response, vi.fn());
    middleware(request, response, vi.fn());

    expect(response.statusCode).toBe(429);
    expect(response.setHeader).toHaveBeenCalledWith(
      "content-type",
      "application/problem+json; charset=utf-8",
    );
    expect(response.end).toHaveBeenCalledWith(
      expect.stringContaining("Too Many Requests"),
    );
  });

  it("passes OpenAPI options, cookie secret, and trust proxy to platform integrations", async () => {
    process.env.COOKIE_SECRET = "secret";
    process.env.TRUST_PROXY = "true";

    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
      openApi: {
        description: "Docs",
        enabled: true,
        path: "openapi",
        title: "Custom API",
        version: "2.0.0",
      },
    });

    expect(mocks.cookieParser).toHaveBeenCalledWith("secret");
    expect(mocks.app.set).toHaveBeenCalledWith("trust proxy", true);
    expect(mocks.setupSwagger).toHaveBeenCalledWith(mocks.app, {
      description: "Docs",
      enabled: true,
      path: "openapi",
      title: "Custom API",
      version: "2.0.0",
    });
  });

  it("continues non-robots requests", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });
    const middleware = mocks.app.use.mock.calls[1][0] as TestMiddleware;
    const next = vi.fn();

    middleware(
      { url: "/health" },
      { end: vi.fn(), on: vi.fn(), setHeader: vi.fn() },
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it("generates request ids and prefers originalUrl in structured logs", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });
    const middleware = mocks.app.use.mock.calls[0][0] as TestMiddleware;
    const finishCallbacks: Array<() => void> = [];
    const response = {
      on: vi.fn((_: "finish", callback: () => void) =>
        finishCallbacks.push(callback),
      ),
      setHeader: vi.fn(),
      statusCode: 200,
    };

    middleware({ method: "POST", originalUrl: "/original" }, response, vi.fn());
    finishCallbacks[0]();

    expect(response.setHeader).toHaveBeenCalledWith(
      "x-request-id",
      expect.any(String),
    );
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toMatchObject({
      path: "/original",
      status: 200,
    });
  });

  it("enables rate limiting from environment configuration", async () => {
    process.env.RATE_LIMIT_ENABLED = "on";
    process.env.RATE_LIMIT_MAX = "2";
    process.env.RATE_LIMIT_WINDOW_MS = "1000";

    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    expect(mocks.app.use).toHaveBeenCalledWith(expect.any(Function));
  });

  it("uses forwarded, socket, and unknown clients for rate-limit keys", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
      rateLimit: { enabled: true, max: 10, windowMs: 1_000 },
    });
    const middleware = mocks.app.use.mock.calls.at(-1)?.[0] as TestMiddleware;
    const response = {
      end: vi.fn(),
      on: vi.fn(),
      setHeader: vi.fn(),
      statusCode: 200,
    };
    const next = vi.fn();

    middleware({ headers: { "x-forwarded-for": "client-a" } }, response, next);
    middleware({ socket: { remoteAddress: "client-b" } }, response, next);
    middleware({}, response, next);

    expect(next).toHaveBeenCalledTimes(3);
  });

  it("uses request.path in logs and originalUrl for robots fallback", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });
    const loggingMiddleware = mocks.app.use.mock.calls[0][0] as TestMiddleware;
    const robotsMiddleware = mocks.app.use.mock.calls[1][0] as TestMiddleware;
    const finishCallbacks: Array<() => void> = [];
    const logResponse = {
      on: vi.fn((_: "finish", callback: () => void) =>
        finishCallbacks.push(callback),
      ),
      setHeader: vi.fn(),
      statusCode: 200,
    };
    const robotsResponse = {
      end: vi.fn(),
      on: vi.fn(),
      setHeader: vi.fn(),
    };

    loggingMiddleware({ path: "/path-only" }, logResponse, vi.fn());
    finishCallbacks[0]();
    robotsMiddleware({ originalUrl: "/robots.txt" }, robotsResponse, vi.fn());

    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toMatchObject({
      path: "/path-only",
    });
    expect(robotsResponse.end).toHaveBeenCalledWith(
      "User-agent: *\nDisallow: /\n",
    );
  });
});
