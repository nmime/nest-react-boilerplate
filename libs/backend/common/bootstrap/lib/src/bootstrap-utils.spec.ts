import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDefaultDevelopmentCorsOrigins } from "./default-development-cors-origins";
import { isRunningInContainer } from "./util/container.util";
import { getPortEnvVarName } from "./util/port.util";
import { RobotsMiddleware, robotsMiddleware } from "./util/robots.util";

describe("bootstrap utilities", () => {
  const originalEnvironment = {
    container: process.env.CONTAINER,
    corsOrigin: process.env.CORS_ORIGIN,
    corsOrigins: process.env.CORS_ORIGINS,
    kubernetesServiceHost: process.env.KUBERNETES_SERVICE_HOST,
    nodeEnv: process.env.NODE_ENV as string | undefined,
  };

  afterEach(() => {
    process.env.CONTAINER = originalEnvironment.container ?? "";
    process.env.CORS_ORIGIN = originalEnvironment.corsOrigin ?? "";
    process.env.CORS_ORIGINS = originalEnvironment.corsOrigins ?? "";
    process.env.KUBERNETES_SERVICE_HOST =
      originalEnvironment.kubernetesServiceHost ?? "";
    process.env.NODE_ENV = originalEnvironment.nodeEnv ?? "";
  });

  it("resolves default development CORS origins only for local development", () => {
    expect(resolveDefaultDevelopmentCorsOrigins({})).toEqual([
      "http://localhost:4200",
      "http://127.0.0.1:4200",
      "http://localhost:4201",
      "http://127.0.0.1:4201",
      "http://localhost:4202",
      "http://127.0.0.1:4202",
    ]);
    expect(
      resolveDefaultDevelopmentCorsOrigins({ NODE_ENV: "production" }),
    ).toBeUndefined();
    expect(
      resolveDefaultDevelopmentCorsOrigins({ CORS_ORIGINS: "https://app" }),
    ).toBeUndefined();
    expect(
      resolveDefaultDevelopmentCorsOrigins({ CORS_ORIGIN: "https://app" }),
    ).toBeUndefined();
  });

  it("detects container runtime hints from environment", () => {
    process.env.KUBERNETES_SERVICE_HOST = "kubernetes.default.svc";
    expect(isRunningInContainer()).toBe(true);

    delete process.env.KUBERNETES_SERVICE_HOST;
    process.env.CONTAINER = "true";
    expect(isRunningInContainer()).toBe(true);

    delete process.env.CONTAINER;
    expect(typeof isRunningInContainer()).toBe("boolean");
  });

  it("normalizes port environment variable names", () => {
    expect(getPortEnvVarName("Admin App API")).toBe("ADMIN_APP_API_PORT");
    expect(getPortEnvVarName("  user-app.api  ")).toBe("USER_APP_API_PORT");
  });

  it("finds a free port and prefers container port 80 when configured", async () => {
    let occupiedErrorHandler:
      ((error: NodeJS.ErrnoException) => void) | undefined;
    let freeListenHandler: (() => void) | undefined;
    const occupiedServer = {
      listen: vi.fn(() => {
        occupiedErrorHandler?.(
          Object.assign(new Error("in use"), { code: "EADDRINUSE" }),
        );
        return occupiedServer;
      }),
      once: vi.fn(
        (_event: "error", handler: (error: NodeJS.ErrnoException) => void) => {
          occupiedErrorHandler = handler;
          return occupiedServer;
        },
      ),
    };
    const freeServer = {
      address: vi.fn(() => ({ port: 3001 })),
      close: vi.fn((handler: () => void) => {
        handler();
      }),
      listen: vi.fn((_port: number, handler: () => void) => {
        freeListenHandler = handler;
        freeListenHandler();
        return freeServer;
      }),
      once: vi.fn(() => freeServer),
    };
    let createServerCalls = 0;
    const createServer = vi.fn(() => {
      const server = createServerCalls === 0 ? occupiedServer : freeServer;
      createServerCalls += 1;
      return server;
    });

    vi.resetModules();
    vi.doMock("node:net", () => ({ createServer }));

    try {
      const {
        defaultPortFactory: defaultPortFactoryWithMock,
        findFreePort: findFreePortWithMock,
      } = await import("./util/port.util");

      await expect(findFreePortWithMock(3000)).resolves.toBe(3001);
      expect(occupiedServer.listen).toHaveBeenCalledWith(
        3000,
        expect.any(Function),
      );
      expect(freeServer.listen).toHaveBeenCalledWith(
        3001,
        expect.any(Function),
      );

      process.env.CONTAINER = "true";
      await expect(defaultPortFactoryWithMock()).resolves.toBe(80);
    } finally {
      vi.doUnmock("node:net");
      vi.resetModules();
    }
  });

  it("rejects unexpected port probing errors", async () => {
    const error = Object.assign(new Error("permission denied"), {
      code: "EACCES",
    });
    let errorHandler: ((error: NodeJS.ErrnoException) => void) | undefined;
    const server = {
      close: vi.fn(),
      listen: vi.fn(() => {
        errorHandler?.(error);
        return server;
      }),
      once: vi.fn(
        (_event: "error", handler: (error: NodeJS.ErrnoException) => void) => {
          errorHandler = handler;
          return server;
        },
      ),
    };

    vi.resetModules();
    vi.doMock("node:net", () => ({
      createServer: vi.fn(() => server),
    }));

    try {
      const { findFreePort: findFreePortWithMock } =
        await import("./util/port.util");

      await expect(findFreePortWithMock(3000)).rejects.toBe(error);
    } finally {
      vi.doUnmock("node:net");
      vi.resetModules();
    }
  });

  it("uses the requested port when the server address is not a TCP address", async () => {
    let listenHandler: (() => void) | undefined;
    const server = {
      address: vi.fn(() => "pipe-address"),
      close: vi.fn((handler: () => void) => {
        handler();
      }),
      listen: vi.fn((_port: number, handler: () => void) => {
        listenHandler = handler;
        listenHandler();
        return server;
      }),
      once: vi.fn(() => server),
    };

    vi.resetModules();
    vi.doMock("node:net", () => ({
      createServer: vi.fn(() => server),
    }));

    try {
      const { findFreePort: findFreePortWithMock } =
        await import("./util/port.util");

      await expect(findFreePortWithMock(4545)).resolves.toBe(4545);
    } finally {
      vi.doUnmock("node:net");
      vi.resetModules();
    }
  });

  it("serves robots.txt through send or end and passes other requests through", () => {
    const middleware = new RobotsMiddleware();
    const next = vi.fn();
    const typedResponse = {
      send: vi.fn(),
      setHeader: vi.fn(),
      type: vi.fn(() => typedResponse),
    };

    middleware.use({ method: "GET", path: "/robots.txt" }, typedResponse, next);

    expect(typedResponse.type).toHaveBeenCalledWith("text/plain");
    expect(typedResponse.setHeader).toHaveBeenCalledWith(
      "content-type",
      "text/plain",
    );
    expect(typedResponse.send).toHaveBeenCalledWith(
      "User-agent: *\nDisallow: /\n",
    );
    expect(next).not.toHaveBeenCalled();

    const endResponse = { end: vi.fn() };
    middleware.use({ method: "GET", url: "/robots.txt" }, endResponse, next);
    expect(endResponse.end).toHaveBeenCalledWith(
      "User-agent: *\nDisallow: /\n",
    );

    robotsMiddleware()({ method: "POST", path: "/robots.txt" }, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
