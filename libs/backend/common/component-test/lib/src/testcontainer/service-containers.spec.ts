import { afterEach, describe, expect, it, vi } from "vitest";

type FakeStartedContainer = {
  getHost: () => string;
  getMappedPort: (port: number) => number;
  stop: () => Promise<void>;
};

type FakeContainer = {
  command: string[];
  environment: Record<string, string>;
  exposedPorts: number[];
  image: string;
  started: boolean;
  startupTimeoutMs: number | undefined;
  waitStrategy: unknown;
  start: () => Promise<FakeStartedContainer>;
  withCommand: (command: string[]) => FakeContainer;
  withEnvironment: (environment: Record<string, string>) => FakeContainer;
  withExposedPorts: (...ports: number[]) => FakeContainer;
  withStartupTimeout: (timeoutMs: number) => FakeContainer;
  withWaitStrategy: (strategy: unknown) => FakeContainer;
};

const testcontainers = vi.hoisted(() => ({
  created: [] as FakeContainer[],
}));

vi.mock("testcontainers", () => {
  class GenericContainer implements FakeContainer {
    command: string[] = [];
    environment: Record<string, string> = {};
    exposedPorts: number[] = [];
    image: string;
    started = false;
    startupTimeoutMs: number | undefined;
    waitStrategy: unknown;

    constructor(image: string) {
      this.image = image;
      testcontainers.created.push(this);
    }

    withCommand(command: string[]): FakeContainer {
      this.command = command;
      return this;
    }

    withEnvironment(environment: Record<string, string>): FakeContainer {
      this.environment = { ...this.environment, ...environment };
      return this;
    }

    withExposedPorts(...ports: number[]): FakeContainer {
      this.exposedPorts.push(...ports);
      return this;
    }

    withStartupTimeout(timeoutMs: number): FakeContainer {
      this.startupTimeoutMs = timeoutMs;
      return this;
    }

    withWaitStrategy(strategy: unknown): FakeContainer {
      this.waitStrategy = strategy;
      return this;
    }

    start(): Promise<FakeStartedContainer> {
      this.started = true;
      return Promise.resolve({
        getHost: () => "127.0.0.1",
        getMappedPort: (port: number) => port + 10_000,
        stop: vi.fn(() => Promise.resolve()),
      });
    }
  }

  return {
    GenericContainer,
    Wait: {
      forListeningPorts: () => ({ strategy: "listening" }),
      forLogMessage: (message: RegExp) => ({ message, strategy: "log" }),
    },
  };
});

const {
  DefaultServiceStartupTimeoutMs,
  createGenericServiceContainer,
  startGenericServiceContainer,
  stopGenericServiceContainer,
} = await import("./generic-service-container");
const {
  DefaultMinioApiPort,
  DefaultMinioConsolePort,
  createMinioContainer,
  startMinioContainer,
} = await import("./minio-container");
const { DefaultMysqlTestPort, createMysqlContainer, startMysqlContainer } =
  await import("./mysql-container");
const {
  DefaultNatsClientPort,
  DefaultNatsMonitoringPort,
  createNatsContainer,
  startNatsContainer,
} = await import("./nats-container");
const { DefaultRedisTestPort, createRedisContainer, startRedisContainer } =
  await import("./redis-container");

const lastContainer = (): FakeContainer => {
  const container = testcontainers.created.at(-1);
  expect(container).toBeDefined();
  return container as FakeContainer;
};

describe("service container helpers", () => {
  afterEach(() => {
    testcontainers.created.length = 0;
  });

  it("applies generic container defaults, environment, and start mapping", async () => {
    const container = createGenericServiceContainer({
      image: "service:test",
      internalPort: 1234,
      environment: { TOKEN: "value" },
    });

    expect(container).toBe(lastContainer());
    expect(lastContainer()).toMatchObject({
      environment: { TOKEN: "value" },
      exposedPorts: [1234],
      image: "service:test",
      startupTimeoutMs: DefaultServiceStartupTimeoutMs,
      waitStrategy: { strategy: "listening" },
    });

    const started = await startGenericServiceContainer({
      image: "service:test",
      internalPort: 1234,
      protocol: "http",
      startupTimeoutMs: 30_000,
    });

    expect(started).toMatchObject({
      host: "127.0.0.1",
      port: 11_234,
      url: "http://127.0.0.1:11234",
    });
    expect(lastContainer().started).toBe(true);

    await expect(
      startGenericServiceContainer({
        image: "service:test",
        internalPort: 1234,
      }),
    ).resolves.toMatchObject({
      url: "tcp://127.0.0.1:11234",
    });

    const stop = vi.fn(() => Promise.resolve());
    const startedContainer: Pick<FakeStartedContainer, "stop"> = { stop };
    await stopGenericServiceContainer({
      container: startedContainer,
      host: "127.0.0.1",
      port: 1234,
      url: "tcp://127.0.0.1:1234",
    });
    await stopGenericServiceContainer(undefined);
    expect(stop).toHaveBeenCalledOnce();
  });

  it("builds MinIO containers and maps API plus console URLs", async () => {
    createMinioContainer({
      image: "minio:test",
      rootPassword: "custom-password",
      rootUser: "custom-user",
      startupTimeoutMs: 45_000,
    });

    expect(lastContainer()).toMatchObject({
      command: ["server", "/data", "--console-address", ":9001"],
      environment: {
        MINIO_ROOT_PASSWORD: "custom-password",
        MINIO_ROOT_USER: "custom-user",
      },
      exposedPorts: [
        DefaultMinioApiPort,
        DefaultMinioApiPort,
        DefaultMinioConsolePort,
      ],
      image: "minio:test",
      startupTimeoutMs: 45_000,
    });

    const started = await startMinioContainer();
    expect(started).toMatchObject({
      consoleUrl: "http://127.0.0.1:19001",
      port: 19_000,
      rootUser: "component_test",
      url: "http://127.0.0.1:19000",
    });
  });

  it("builds MySQL and Redis containers with defaults and start URLs", async () => {
    createMysqlContainer();
    expect(lastContainer().environment).toMatchObject({
      MYSQL_DATABASE: "component_test",
      MYSQL_USER: "component_test",
    });

    createMysqlContainer({ database: "db", username: "user" });
    expect(lastContainer().environment).toMatchObject({
      MYSQL_DATABASE: "db",
      MYSQL_USER: "user",
    });

    await expect(startMysqlContainer()).resolves.toMatchObject({
      port: DefaultMysqlTestPort + 10_000,
      url: "mysql://127.0.0.1:13306",
    });

    createRedisContainer();
    expect(lastContainer()).toMatchObject({
      exposedPorts: [DefaultRedisTestPort],
      image: "redis:7-alpine",
    });

    createRedisContainer({ image: "redis:test", internalPort: 6380 });
    expect(lastContainer()).toMatchObject({
      exposedPorts: [6380],
      image: "redis:test",
    });
    await expect(startRedisContainer()).resolves.toMatchObject({
      port: DefaultRedisTestPort + 10_000,
      url: "redis://127.0.0.1:16379",
    });
    await expect(
      startRedisContainer({ image: "redis:test", internalPort: 6380 }),
    ).resolves.toMatchObject({
      port: 16_380,
      url: "redis://127.0.0.1:16380",
    });
  });

  it("builds NATS containers with optional JetStream and monitoring URLs", async () => {
    createNatsContainer();
    expect(lastContainer().command).toEqual([
      "-m",
      `${DefaultNatsMonitoringPort}`,
    ]);

    createNatsContainer({ jetStream: true, startupTimeoutMs: 15_000 });
    expect(lastContainer()).toMatchObject({
      command: ["-js", "-m", `${DefaultNatsMonitoringPort}`],
      exposedPorts: [
        DefaultNatsClientPort,
        DefaultNatsClientPort,
        DefaultNatsMonitoringPort,
      ],
      startupTimeoutMs: 15_000,
    });

    await expect(startNatsContainer()).resolves.toMatchObject({
      clientUrl: "nats://127.0.0.1:14222",
      monitoringPort: 18_222,
      monitoringUrl: "http://127.0.0.1:18222",
      server: "nats://127.0.0.1:14222",
    });
  });
});
