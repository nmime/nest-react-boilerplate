import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const app = {
    enableCors: vi.fn(),
    enableShutdownHooks: vi.fn(),
    listen: vi.fn(() => Promise.resolve()),
    use: vi.fn(),
    useLogger: vi.fn(),
  };
  const logger = { log: vi.fn() };
  const middleware = vi.fn();
  const helmetMiddleware = vi.fn();

  return {
    app,
    createLogger: vi.fn(() => ({ logger, middlewares: [middleware] })),
    helmet: vi.fn(() => helmetMiddleware),
    helmetMiddleware,
    initOpenTelemetry: vi.fn(),
    logger,
    middleware,
    nestCreate: vi.fn(() => Promise.resolve(app)),
    setupSwagger: vi.fn(),
  };
});

vi.mock("@nestjs/core", () => ({
  NestFactory: { create: mocks.nestCreate },
}));

vi.mock("helmet", () => ({
  default: mocks.helmet,
}));

vi.mock("@app/backend-common-logger", () => ({
  createLogger: mocks.createLogger,
}));

vi.mock("@app/backend-common-otel", () => ({
  initOpenTelemetry: mocks.initOpenTelemetry,
}));

vi.mock("@app/backend-common-swagger", () => ({
  setupSwagger: mocks.setupSwagger,
}));

import { bootstrap } from "./bootstrap";

class TestModule {}

describe("bootstrap", () => {
  const originalEnvironment = {
    gracefulShutdown: process.env.GRACEFUL_SHUTDOWN,
    nodeEnv: process.env.NODE_ENV,
    npmPackageVersion: process.env.npm_package_version,
    otelServiceVersion: process.env.OTEL_SERVICE_VERSION,
    testApiPort: process.env.TEST_API_PORT,
  };

  beforeEach(() => {
    delete process.env.GRACEFUL_SHUTDOWN;
    delete process.env.NODE_ENV;
    delete process.env.npm_package_version;
    delete process.env.OTEL_SERVICE_VERSION;
    delete process.env.TEST_API_PORT;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.GRACEFUL_SHUTDOWN = originalEnvironment.gracefulShutdown ?? "";
    process.env.NODE_ENV = originalEnvironment.nodeEnv ?? "";
    process.env.npm_package_version =
      originalEnvironment.npmPackageVersion ?? "";
    process.env.OTEL_SERVICE_VERSION =
      originalEnvironment.otelServiceVersion ?? "";
    process.env.TEST_API_PORT = originalEnvironment.testApiPort ?? "";
  });

  it("creates and listens with static options", async () => {
    process.env.NODE_ENV = "test";
    process.env.OTEL_SERVICE_VERSION = "1.2.3";
    const beforeListen = vi.fn();
    const afterListen = vi.fn();

    const app = await bootstrap({
      name: "test-api",
      module: TestModule,
      port: 3123,
      cors: { origin: "https://app.example.test" },
      swagger: { title: "API", description: "Docs", version: "1" },
      gracefulShutdown: true,
      hooks: { beforeListen, afterListen },
    });

    expect(app).toBe(mocks.app);
    expect(mocks.initOpenTelemetry).toHaveBeenCalledWith({
      serviceName: "test-api",
      serviceVersion: "1.2.3",
      environment: "test",
    });
    expect(mocks.nestCreate).toHaveBeenCalledWith(TestModule, {
      logger: mocks.logger,
      rawBody: true,
    });
    expect(mocks.app.useLogger).toHaveBeenCalledWith(mocks.logger);
    expect(mocks.app.use).toHaveBeenCalledWith(mocks.middleware);
    expect(mocks.app.use).toHaveBeenCalledWith(mocks.helmetMiddleware);
    expect(mocks.app.enableCors).toHaveBeenCalledWith({
      origin: "https://app.example.test",
    });
    expect(mocks.setupSwagger).toHaveBeenCalledWith(
      mocks.app,
      expect.objectContaining({ title: "API" }),
    );
    expect(mocks.app.enableShutdownHooks).toHaveBeenCalled();
    expect(beforeListen).toHaveBeenCalledWith(mocks.app);
    expect(mocks.app.listen).toHaveBeenCalledWith(3123);
    expect(mocks.logger.log).toHaveBeenCalledWith(
      "test-api listening on port 3123",
    );
    expect(afterListen).toHaveBeenCalledWith(mocks.app);
  });

  it("uses env and async factories for optional runtime settings", async () => {
    process.env.TEST_API_PORT = "4123";
    process.env.GRACEFUL_SHUTDOWN = "true";
    process.env.npm_package_version = "9.9.9";
    const cors = vi.fn(() => Promise.resolve({ credentials: true }));
    const port = vi.fn(() => Promise.resolve(3124));

    await bootstrap({
      name: "test api",
      module: Promise.resolve(TestModule),
      port,
      cors,
    });

    expect(cors).toHaveBeenCalledWith(mocks.app);
    expect(port).not.toHaveBeenCalled();
    expect(mocks.app.enableCors).toHaveBeenCalledWith({ credentials: true });
    expect(mocks.app.enableShutdownHooks).toHaveBeenCalled();
    expect(mocks.app.listen).toHaveBeenCalledWith(4123);
    expect(mocks.initOpenTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({ serviceVersion: "9.9.9" }),
    );
  });

  it("uses a port factory and rejects invalid ports", async () => {
    const port = vi.fn(() => Promise.resolve(3222));

    await bootstrap({ name: "factory-api", module: TestModule, port });

    expect(port).toHaveBeenCalledWith(mocks.app);
    expect(mocks.app.listen).toHaveBeenCalledWith(3222);

    await expect(
      bootstrap({ name: "broken-api", module: TestModule, port: 70_000 }),
    ).rejects.toThrow("Invalid port for broken-api: 70000");
  });

  it("falls back to the default port factory when no port is configured", async () => {
    await bootstrap({ name: "default-api", module: TestModule });

    expect(mocks.app.listen).toHaveBeenCalledWith(expect.any(Number));
  });
});
