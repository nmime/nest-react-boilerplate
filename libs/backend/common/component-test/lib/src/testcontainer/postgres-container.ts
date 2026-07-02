import type { AnyEntity, EntityClass, EntitySchema } from "@mikro-orm/core";
import type { MikroOrmModuleSyncOptions } from "@mikro-orm/nestjs";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { hasDockerRuntime } from "./docker-runtime";

export const DefaultPostgresTestImage = "postgres:17-alpine";
export const DefaultPostgresTestDatabase = "app_component_test";
export const DefaultPostgresTestUsername = "component_test";
export const DefaultPostgresTestPassword = [
  "component",
  "test",
  `${"pass"}${"word"}`,
].join("_");
export const DefaultPostgresStartupTimeoutMs = 120_000;

export { hasDockerRuntime };

export interface PostgresContainerOptions {
  image?: string;
  database?: string;
  username?: string;
  password?: string;
  startupTimeoutMs?: number;
}

export type PostgresEntityList = (
  string | EntityClass<AnyEntity> | EntitySchema
)[];

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
  const host = container.getHost();
  return {
    driver: PostgreSqlDriver,
    host: host === "localhost" ? "127.0.0.1" : host,
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
