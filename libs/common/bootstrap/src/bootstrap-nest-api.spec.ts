import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const app = {
    enableCors: vi.fn(),
    listen: vi.fn(),
    use: vi.fn(),
    useGlobalPipes: vi.fn(),
  };
  const helmetMiddleware = vi.fn();
  return {
    app,
    createProblemValidationPipe: vi.fn(() => "validation-pipe"),
    helmet: vi.fn(() => helmetMiddleware),
    helmetMiddleware,
    nestCreate: vi.fn(() => Promise.resolve(app)),
  };
});

vi.mock("@nestjs/core", () => ({
  NestFactory: { create: mocks.nestCreate },
}));

vi.mock("helmet", () => ({
  default: mocks.helmet,
}));

vi.mock("@app/common/validation", () => ({
  createProblemValidationPipe: mocks.createProblemValidationPipe,
}));

import { bootstrapNestApi } from "./index";

class TestModule {}

describe("bootstrapNestApi", () => {
  const originalEnvironment = {
    corsOrigin: process.env.CORS_ORIGIN,
    corsOrigins: process.env.CORS_ORIGINS,
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
  };

  beforeEach(() => {
    delete process.env.CORS_ORIGIN;
    delete process.env.CORS_ORIGINS;
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreEnv("CORS_ORIGIN", originalEnvironment.corsOrigin);
    restoreEnv("CORS_ORIGINS", originalEnvironment.corsOrigins);
    restoreEnv("NODE_ENV", originalEnvironment.nodeEnv);
    restoreEnv("PORT", originalEnvironment.port);
  });

  it("creates an app with security middleware, validation, development CORS, and the default port", async () => {
    await bootstrapNestApi(TestModule, {
      appName: "test-api",
      defaultPort: 3010,
    });

    expect(mocks.nestCreate).toHaveBeenCalledWith(TestModule, {
      bufferLogs: true,
    });
    expect(mocks.helmet).toHaveBeenCalledOnce();
    expect(mocks.app.use).toHaveBeenCalledWith(mocks.helmetMiddleware);
    expect(mocks.createProblemValidationPipe).toHaveBeenCalledOnce();
    expect(mocks.app.useGlobalPipes).toHaveBeenCalledWith("validation-pipe");
    expect(mocks.app.enableCors).toHaveBeenCalledWith({
      credentials: true,
      origin: true,
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
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
