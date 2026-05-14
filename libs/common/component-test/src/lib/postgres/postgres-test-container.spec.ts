import { describe, expect, it, vi } from "vitest";
import {
  DefaultPostgresStartupTimeoutMs,
  createPostgresContainer,
  createPostgresContainerTypeOrmOptions,
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

  it("maps a started container to safe TypeORM component-test options", () => {
    const container: FakeStartedPostgresContainer = {
      getHost: () => "127.0.0.1",
      getPort: () => 15432,
      getUsername: () => "component_user",
      getPassword: () => "component_password",
      getDatabase: () => "component_db",
    };

    expect(
      createPostgresContainerTypeOrmOptions(container as never, [], {
        logging: true,
      }),
    ).toMatchObject({
      type: "postgres",
      host: "127.0.0.1",
      port: 15432,
      username: "component_user",
      password: "component_password",
      database: "component_db",
      synchronize: true,
      dropSchema: true,
      logging: true,
      ssl: false,
    });
  });
  it("stops containers when provided and ignores undefined", async () => {
    const stop = vi.fn(() => Promise.resolve());

    await stopPostgresContainer({ stop } as never);
    await stopPostgresContainer(undefined);

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
