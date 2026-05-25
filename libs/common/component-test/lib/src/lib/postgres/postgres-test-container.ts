import { spawnSync } from "node:child_process";
import type { MikroOrmModuleSyncOptions } from "@mikro-orm/nestjs";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

export const DefaultPostgresTestImage = "postgres:17-alpine";
export const DefaultPostgresTestDatabase = "app_component_test";
export const DefaultPostgresTestUsername = "component_test";
// Test-only credential for isolated disposable containers.
// eslint-disable-next-line sonarjs/no-hardcoded-passwords
export const DefaultPostgresTestPassword = "component_test_password";
export const DefaultPostgresStartupTimeoutMs = 120_000;

export function hasDockerRuntime(): boolean {
  if (process.env.SKIP_TESTCONTAINERS === "true") {
    return false;
  }

  if (process.env.CI === "true") {
    return true;
  }

  const dockerBinaryPaths = [
    "/usr/bin/docker",
    "/usr/local/bin/docker",
  ] as const;

  return dockerBinaryPaths.some((dockerBinaryPath) => {
    try {
      const result = spawnSync(dockerBinaryPath, ["version"], {
        stdio: "ignore",
        timeout: 5_000,
      });
      return result.status === 0;
    } catch {
      return false;
    }
  });
}

export interface PostgresContainerOptions {
  image?: string;
  database?: string;
  username?: string;
  password?: string;
  startupTimeoutMs?: number;
}

export type PostgresEntityList = NonNullable<
  MikroOrmModuleSyncOptions["entities"]
>;

export type PostgresMikroOrmTestOptions = MikroOrmModuleSyncOptions;

export function createPostgresContainer(
  options: PostgresContainerOptions = {},
): PostgreSqlContainer {
  return new PostgreSqlContainer(options.image ?? DefaultPostgresTestImage)
    .withDatabase(options.database ?? DefaultPostgresTestDatabase)
    .withUsername(options.username ?? DefaultPostgresTestUsername)
    .withPassword(options.password ?? DefaultPostgresTestPassword)
    .withStartupTimeout(
      options.startupTimeoutMs ?? DefaultPostgresStartupTimeoutMs,
    );
}

/* v8 ignore next 4 -- exercised by downstream component specs to avoid starting Docker in unit tests. */
export async function startPostgresContainer(
  options: PostgresContainerOptions = {},
): Promise<StartedPostgreSqlContainer> {
  return createPostgresContainer(options).start();
}

export async function stopPostgresContainer(
  container: StartedPostgreSqlContainer | undefined,
): Promise<void> {
  if (container) {
    await container.stop();
  }
}

export function createPostgresContainerMikroOrmOptions(
  container: StartedPostgreSqlContainer,
  entities: PostgresEntityList = [],
  overrides: Partial<PostgresMikroOrmTestOptions> = {},
): PostgresMikroOrmTestOptions {
  return {
    driver: PostgreSqlDriver as unknown as MikroOrmModuleSyncOptions["driver"],
    host: container.getHost(),
    port: container.getPort(),
    user: container.getUsername(),
    password: container.getPassword(),
    dbName: container.getDatabase(),
    entities,
    autoLoadEntities: true,
    allowGlobalContext: true,
    debug: false,
    driverOptions: {},
    ...overrides,
  };
}
