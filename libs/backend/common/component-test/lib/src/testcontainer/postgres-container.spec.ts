import { spawnSync } from "node:child_process";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DefaultPostgresStartupTimeoutMs,
  createPostgresContainer,
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  stopPostgresContainer,
} from "./postgres-container";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

interface FakeStartedPostgresContainer {
  getHost(): string;
  getPort(): number;
  getUsername(): string;
  getPassword(): string;
  getDatabase(): string;
}

const mockedSpawnSync = vi.mocked(spawnSync);

describe("postgres test container helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockedSpawnSync.mockReset();
  });

  it("creates a default PostgreSQL container without starting it", () => {
    expect(createPostgresContainer()).toBeDefined();
  });

  it("creates a configured PostgreSQL container without starting it", () => {
    const container = createPostgresContainer({
      image: "postgres:17-alpine",
      database: "unit_db",
      username: "unit_user",
      password: "unit_password",
      startupTimeoutMs: DefaultPostgresStartupTimeoutMs,
    });

    expect(container).toBeDefined();
  });

  it("maps a started container to safe MikroORM component-test options", () => {
    const container: FakeStartedPostgresContainer = {
      getHost: () => "127.0.0.1",
      getPort: () => 15432,
      getUsername: () => "component_user",
      getPassword: () => "component_password",
      getDatabase: () => "component_db",
    };

    expect(
      createPostgresContainerMikroOrmOptions(container as never, [], {
        debug: true,
      }),
    ).toMatchObject({
      driver: PostgreSqlDriver,
      host: "127.0.0.1",
      port: 15432,
      user: "component_user",
      password: "component_password",
      dbName: "component_db",
      entities: [],
      autoLoadEntities: true,
      allowGlobalContext: true,
      debug: true,
      driverOptions: {},
    });
  });

  it("maps a started container host from localhost to 127.0.0.1", () => {
    const container: FakeStartedPostgresContainer = {
      getHost: () => "localhost",
      getPort: () => 15432,
      getUsername: () => "component_user",
      getPassword: () => "component_password",
      getDatabase: () => "component_db",
    };

    expect(
      createPostgresContainerMikroOrmOptions(container as never, []),
    ).toMatchObject({
      host: "127.0.0.1",
    });
  });

  it("detects Docker availability from explicit skip, CI, and local runtime checks", () => {
    vi.stubEnv("SKIP_TESTCONTAINERS", "true");
    expect(hasDockerRuntime()).toBe(false);
    expect(mockedSpawnSync).not.toHaveBeenCalled();

    vi.stubEnv("SKIP_TESTCONTAINERS", "false");
    vi.stubEnv("CI", "true");
    expect(hasDockerRuntime()).toBe(true);
    expect(mockedSpawnSync).not.toHaveBeenCalled();

    vi.stubEnv("CI", "false");
    mockedSpawnSync.mockReturnValueOnce({ status: 0 } as never);
    expect(hasDockerRuntime()).toBe(true);
    expect(mockedSpawnSync).toHaveBeenCalledWith("docker", ["version"], {
      stdio: "ignore",
      timeout: 5_000,
    });

    mockedSpawnSync.mockReset();
    mockedSpawnSync
      .mockImplementationOnce(() => {
        throw new Error("missing docker");
      })
      .mockReturnValueOnce({ status: 1 } as never);

    expect(hasDockerRuntime()).toBe(false);
  });

  it("stops containers when provided and ignores undefined", async () => {
    const stop = vi.fn(() => Promise.resolve());

    await stopPostgresContainer({ stop } as never);
    await stopPostgresContainer(undefined);

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
