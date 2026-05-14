import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { describe, expect, it, vi } from "vitest";
import {
  DefaultPostgresStartupTimeoutMs,
  createPostgresContainer,
  createPostgresContainerMikroOrmOptions,
  stopPostgresContainer,
} from "./postgres-test-container";

interface FakeStartedPostgresContainer {
  getHost(): string;
  getPort(): number;
  getUsername(): string;
  getPassword(): string;
  getDatabase(): string;
}

describe("postgres test container helpers", () => {
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

  it("stops containers when provided and ignores undefined", async () => {
    const stop = vi.fn(() => Promise.resolve());

    await stopPostgresContainer({ stop } as never);
    await stopPostgresContainer(undefined);

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
