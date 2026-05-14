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
  const originalPort = process.env.PORT;

  beforeEach(() => {
    delete process.env.PORT;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalPort === undefined) {
      delete process.env.PORT;
      return;
    }

    process.env.PORT = originalPort;
  });

  it("creates an app with security middleware, validation, CORS, and the default port", async () => {
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

  it("uses explicit CORS origins and a PORT override", async () => {
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
