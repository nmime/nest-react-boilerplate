import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const app = {
    enableCors: vi.fn(),
    enableShutdownHooks: vi.fn(),
    listen: vi.fn(),
    use: vi.fn(),
    useGlobalPipes: vi.fn(),
  };
  const documentBuilder = {
    addBearerAuth: vi.fn(() => documentBuilder),
    build: vi.fn(() => "swagger-config"),
    setTitle: vi.fn(() => documentBuilder),
    setVersion: vi.fn(() => documentBuilder),
  };
  const helmetMiddleware = vi.fn();
  return {
    app,
    createDocument: vi.fn(() => "swagger-document"),
    createProblemValidationPipe: vi.fn(() => "validation-pipe"),
    documentBuilder,
    helmet: vi.fn(() => helmetMiddleware),
    helmetMiddleware,
    nestCreate: vi.fn(() => Promise.resolve(app)),
    setup: vi.fn(),
  };
});

vi.mock("@nestjs/core", () => ({
  NestFactory: { create: mocks.nestCreate },
}));

vi.mock("@nestjs/swagger", () => ({
  DocumentBuilder: vi.fn(function DocumentBuilderMock() {
    return mocks.documentBuilder;
  }),
  SwaggerModule: {
    createDocument: mocks.createDocument,
    setup: mocks.setup,
  },
}));

vi.mock("helmet", () => ({
  default: mocks.helmet,
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

describe("bootstrapNestApi", () => {
  const originalEnvironment = {
    corsOrigin: process.env.CORS_ORIGIN,
    corsOrigins: process.env.CORS_ORIGINS,
    nodeEnv: process.env.NODE_ENV,
    openApiEnabled: process.env.OPENAPI_ENABLED,
    openApiPath: process.env.OPENAPI_PATH,
    openApiTitle: process.env.OPENAPI_TITLE,
    openApiVersion: process.env.OPENAPI_VERSION,
    port: process.env.PORT,
    rateLimitEnabled: process.env.RATE_LIMIT_ENABLED,
    rateLimitMax: process.env.RATE_LIMIT_MAX,
    rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
  };

  beforeEach(() => {
    delete process.env.CORS_ORIGIN;
    delete process.env.CORS_ORIGINS;
    delete process.env.NODE_ENV;
    delete process.env.OPENAPI_ENABLED;
    delete process.env.OPENAPI_PATH;
    delete process.env.OPENAPI_TITLE;
    delete process.env.OPENAPI_VERSION;
    delete process.env.PORT;
    delete process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_MAX;
    delete process.env.RATE_LIMIT_WINDOW_MS;
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv("CORS_ORIGIN", originalEnvironment.corsOrigin);
    restoreEnv("CORS_ORIGINS", originalEnvironment.corsOrigins);
    restoreEnv("NODE_ENV", originalEnvironment.nodeEnv);
    restoreEnv("OPENAPI_ENABLED", originalEnvironment.openApiEnabled);
    restoreEnv("OPENAPI_PATH", originalEnvironment.openApiPath);
    restoreEnv("OPENAPI_TITLE", originalEnvironment.openApiTitle);
    restoreEnv("OPENAPI_VERSION", originalEnvironment.openApiVersion);
    restoreEnv("PORT", originalEnvironment.port);
    restoreEnv("RATE_LIMIT_ENABLED", originalEnvironment.rateLimitEnabled);
    restoreEnv("RATE_LIMIT_MAX", originalEnvironment.rateLimitMax);
    restoreEnv("RATE_LIMIT_WINDOW_MS", originalEnvironment.rateLimitWindowMs);
  });

  it("creates an app with shutdown hooks, request logging, security middleware, validation, development CORS, and the default port", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    expect(mocks.nestCreate).toHaveBeenCalledWith(TestModule, {
      bufferLogs: true,
    });
    expect(mocks.app.enableShutdownHooks).toHaveBeenCalledOnce();
    expect(mocks.app.use).toHaveBeenNthCalledWith(1, expect.any(Function));
    expect(mocks.helmet).toHaveBeenCalledOnce();
    expect(mocks.app.use).toHaveBeenCalledWith(mocks.helmetMiddleware);
    expect(mocks.createProblemValidationPipe).toHaveBeenCalledOnce();
    expect(mocks.app.useGlobalPipes).toHaveBeenCalledWith("validation-pipe");
    expect(mocks.app.enableCors).toHaveBeenCalledWith({
      credentials: true,
      origin: true,
    });
    expect(mocks.setup).not.toHaveBeenCalled();
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
    logSpy.mockRestore();
  });

  it("generates request ids and logs originalUrl/path fallbacks", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });
    const middleware = mocks.app.use.mock.calls[0][0] as TestMiddleware;

    const firstFinishCallbacks: Array<() => void> = [];
    const firstResponse = {
      on: vi.fn((_: "finish", callback: () => void) =>
        firstFinishCallbacks.push(callback),
      ),
      setHeader: vi.fn(),
      statusCode: 201,
    };
    middleware(
      {
        headers: {},
        method: "POST",
        originalUrl: "/original-url",
        url: "/url-fallback",
      },
      firstResponse,
      vi.fn(),
    );
    firstFinishCallbacks[0]();

    const generatedRequestId = firstResponse.setHeader.mock
      .calls[0][1] as string;
    expect(generatedRequestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
    expect(JSON.parse(logSpy.mock.calls[0][0] as string)).toMatchObject({
      path: "/original-url",
      requestId: generatedRequestId,
    });

    const secondFinishCallbacks: Array<() => void> = [];
    const secondResponse = {
      on: vi.fn((_: "finish", callback: () => void) =>
        secondFinishCallbacks.push(callback),
      ),
      setHeader: vi.fn(),
      statusCode: 202,
    };
    middleware(
      {
        headers: {},
        method: "PATCH",
        path: "/path-fallback",
      },
      secondResponse,
      vi.fn(),
    );
    secondFinishCallbacks[0]();

    expect(JSON.parse(logSpy.mock.calls[1][0] as string)).toMatchObject({
      path: "/path-fallback",
      status: 202,
    });
    logSpy.mockRestore();
  });

  it("installs rate limiting only when enabled", async () => {
    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.RATE_LIMIT_MAX = "1";
    process.env.RATE_LIMIT_WINDOW_MS = "1000";

    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    expect(mocks.app.use).toHaveBeenCalledTimes(3);
    const rateLimitMiddleware = mocks.app.use.mock
      .calls[2][0] as TestMiddleware;
    const next = vi.fn();
    const response = {
      end: vi.fn(),
      on: vi.fn(),
      setHeader: vi.fn(),
      statusCode: 200,
    };

    rateLimitMiddleware({ headers: {}, ip: "127.0.0.1" }, response, next);
    rateLimitMiddleware({ headers: {}, ip: "127.0.0.1" }, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(429);
    expect(response.end).toHaveBeenCalledWith(
      JSON.stringify({
        error: { code: "rate_limited", message: "Too many requests." },
      }),
    );
  });

  it("uses rate-limit identity fallbacks and resets expired buckets", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
      rateLimit: { enabled: true, max: 1, windowMs: 1 },
    });

    const rateLimitMiddleware = mocks.app.use.mock
      .calls[2][0] as TestMiddleware;
    const next = vi.fn();
    const response = {
      end: vi.fn(),
      on: vi.fn(),
      setHeader: vi.fn(),
      statusCode: 200,
    };

    rateLimitMiddleware(
      { headers: {}, socket: { remoteAddress: "socket-client" } },
      response,
      next,
    );
    rateLimitMiddleware({ headers: {} }, response, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(response.end).not.toHaveBeenCalled();
  });

  it("uses explicit OpenAPI options before environment fallbacks", async () => {
    process.env.OPENAPI_ENABLED = "false";
    process.env.OPENAPI_PATH = "ignored-openapi";
    process.env.OPENAPI_TITLE = "Ignored API";
    process.env.OPENAPI_VERSION = "ignored-version";

    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
      openApi: {
        enabled: true,
        path: "docs",
        title: "Explicit API",
        version: "1.2.3",
      },
    });

    expect(mocks.documentBuilder.setTitle).toHaveBeenCalledWith("Explicit API");
    expect(mocks.documentBuilder.setVersion).toHaveBeenCalledWith("1.2.3");
    expect(mocks.setup).toHaveBeenCalledWith(
      "docs",
      mocks.app,
      "swagger-document",
    );
  });

  it("uses default OpenAPI title, version, and path fallbacks", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "fallback-api",
      defaultPort: 3010,
      openApi: { enabled: true },
    });

    expect(mocks.documentBuilder.setTitle).toHaveBeenCalledWith("fallback-api");
    expect(mocks.documentBuilder.setVersion).toHaveBeenCalledWith("1.0.0");
    expect(mocks.setup).toHaveBeenCalledWith(
      "docs",
      mocks.app,
      "swagger-document",
    );
  });

  it("sets up OpenAPI only when enabled", async () => {
    process.env.OPENAPI_ENABLED = "true";
    process.env.OPENAPI_PATH = "openapi";
    process.env.OPENAPI_TITLE = "Production API";
    process.env.OPENAPI_VERSION = "2026.1.0";

    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    expect(mocks.documentBuilder.setTitle).toHaveBeenCalledWith(
      "Production API",
    );
    expect(mocks.documentBuilder.setVersion).toHaveBeenCalledWith("2026.1.0");
    expect(mocks.documentBuilder.addBearerAuth).toHaveBeenCalledOnce();
    expect(mocks.createDocument).toHaveBeenCalledWith(
      mocks.app,
      "swagger-config",
    );
    expect(mocks.setup).toHaveBeenCalledWith(
      "openapi",
      mocks.app,
      "swagger-document",
    );
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
