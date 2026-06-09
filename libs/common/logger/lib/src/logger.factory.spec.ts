import { EventEmitter } from "node:events";
import type { LoggerService } from "@nestjs/common";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import {
  createLogger,
  createRequestLoggerMiddleware,
  redactProtectedVariables,
  redactSensitiveString,
  RedactedValue,
  StructuredConsoleLogger,
  type RequestLogLike,
  type ResponseLogLike,
} from "./logger.factory";

class TestResponse extends EventEmitter implements ResponseLogLike {
  readonly headers = new Map<string, string>();
  statusCode = 200;

  setHeader(name: string, value: string): void {
    this.headers.set(name, value);
  }
}

const withJsonLogger = () => {
  const stdout = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  const stderr = vi
    .spyOn(process.stderr, "write")
    .mockImplementation(() => true);
  process.env.LOG_FORMAT = "json";

  return { stderr, stdout };
};

const firstStdoutJson = (stdout: MockInstance<typeof process.stdout.write>) =>
  JSON.parse(String(stdout.mock.calls[0]?.[0]).trim()) as Record<
    string,
    unknown
  >;

const createTestLogger = (log = vi.fn()): LoggerService => ({
  error: vi.fn(),
  log,
  warn: vi.fn(),
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-01-02T03:04:05.006Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.LOG_FORMAT;
  delete process.env.LOGGER_FORMAT;
  delete process.env.LOG_LEVEL;
});

describe("redactSensitiveString", () => {
  it("redacts protected values from plain strings", () => {
    expect(
      redactSensitiveString(
        "authorization=abc token=abc123 password:super-secret ok=true",
      ),
    ).toBe(
      `authorization=${RedactedValue} token=${RedactedValue} password:${RedactedValue} ok=true`,
    );
  });

  it("redacts bearer credentials without removing safe text", () => {
    expect(redactSensitiveString("Authorization: Bearer abc.def.ghi")).toBe(
      `Authorization: ${RedactedValue} ${RedactedValue}`,
    );
  });
});

describe("redactProtectedVariables", () => {
  it("redacts protected object fields deeply and preserves safe values", () => {
    expect(
      redactProtectedVariables({
        nested: {
          accessToken: "abc",
          safe: "visible",
        },
        query: "api_key=abc&value=1",
      }),
    ).toEqual({
      nested: {
        accessToken: RedactedValue,
        safe: "visible",
      },
      query: `api_key=${RedactedValue}&value=1`,
    });
  });

  it("serializes Error instances with redacted message, stack, cause, and code", () => {
    const error = new Error("failed password=secret", {
      cause: new Error("cause token=abc"),
    });
    error.stack = "Error: failed password=secret\n    at test";
    Object.assign(error, { code: "token=abc", statusCode: 500 });

    expect(redactProtectedVariables(error)).toEqual({
      cause: {
        cause: undefined,
        code: undefined,
        message: `cause token=${RedactedValue}`,
        name: "Error",
        stack: expect.any(String) as string,
        status: undefined,
        statusCode: undefined,
      },
      code: `token=${RedactedValue}`,
      message: `failed password=${RedactedValue}`,
      name: "Error",
      stack: `Error: failed password=${RedactedValue}\n    at test`,
      status: undefined,
      statusCode: 500,
    });
  });
});

describe("StructuredConsoleLogger", () => {
  it("emits structured JSON for object, string, and Error messages", () => {
    const { stderr, stdout } = withJsonLogger();
    const logger = new StructuredConsoleLogger("api");

    logger.log({ message: "created", requestId: "req-1", token: "abc" });
    logger.warn("token=abc visible");
    logger.error(new Error("password=secret"));

    expect(stdout).toHaveBeenCalledTimes(2);
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(firstStdoutJson(stdout)).toMatchObject({
      appName: "api",
      level: "log",
      message: "created",
      requestId: "req-1",
      timestamp: "2024-01-02T03:04:05.006Z",
      token: RedactedValue,
    });
    expect(JSON.parse(String(stdout.mock.calls[1]?.[0]))).toMatchObject({
      level: "warn",
      message: `token=${RedactedValue} visible`,
    });
    expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({
      level: "error",
      message: `password=${RedactedValue}`,
    });
  });

  it("honors configured log levels for compatibility with Nest ConsoleLogger", () => {
    const { stderr, stdout } = withJsonLogger();
    const logger = new StructuredConsoleLogger("api");

    logger.setLogLevels(["error"]);
    logger.warn("hidden");
    logger.error("visible");

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(1);
  });
});

describe("createRequestLoggerMiddleware", () => {
  it("adds request id context and logs completed requests", () => {
    const log = vi.fn();
    const middleware = createRequestLoggerMiddleware(
      createTestLogger(log),
      "api",
      "x-correlation-id",
    );
    const response = new TestResponse();
    const next = vi.fn();

    middleware(
      {
        headers: {
          "x-correlation-id": "req-1",
          "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        },
        method: "GET",
        originalUrl: "/users?token=abc",
      },
      response,
      next,
    );

    response.statusCode = 201;
    vi.advanceTimersByTime(25);
    response.emit("finish");

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.headers.get("x-correlation-id")).toBe("req-1");
    expect(log).toHaveBeenCalledWith({
      appName: "api",
      durationMs: 25,
      ip: "203.0.113.10",
      method: "GET",
      path: "/users?token=abc",
      requestId: "req-1",
      status: 201,
    });
  });

  it("suppresses health check and favicon request logging", () => {
    const log = vi.fn();
    const middleware = createRequestLoggerMiddleware(
      createTestLogger(log),
      "api",
    );

    for (const path of ["/health", "/readyz?full=true", "/favicon.ico"]) {
      const response = new TestResponse();
      middleware({ method: "GET", originalUrl: path }, response, vi.fn());
      response.emit("finish");
    }

    expect(log).not.toHaveBeenCalled();
  });
});

describe("createLogger", () => {
  it("preserves the public factory API", () => {
    const { logger, middlewares } = createLogger({
      levels: ["error", "warn"],
      name: "api",
      requestIdHeader: "x-correlation-id",
    });

    expect(logger).toBeInstanceOf(StructuredConsoleLogger);
    expect(typeof logger.log).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(middlewares).toHaveLength(1);
    expect(typeof middlewares[0]).toBe("function");
  });

  it("keeps middleware compatible with Express-style request/response objects", () => {
    const { middlewares } = createLogger({ name: "api" });
    const response = new TestResponse();
    const request: RequestLogLike = {
      headers: {},
      method: "POST",
      path: "/compat",
      socket: { remoteAddress: "127.0.0.1" },
    };
    const next = vi.fn();

    middlewares[0]?.(request, response, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.headers.get("x-request-id")).toEqual(expect.any(String));
  });
});
