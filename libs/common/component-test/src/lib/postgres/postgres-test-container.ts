import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";

export const DefaultPostgresTestImage = "postgres:17-alpine";
export const DefaultPostgresTestDatabase = "app_component_test";
export const DefaultPostgresTestUsername = "component_test";
// Test-only credential for isolated disposable containers.
// eslint-disable-next-line sonarjs/no-hardcoded-passwords
export const DefaultPostgresTestPassword = "component_test_password";
export const DefaultPostgresStartupTimeoutMs = 120_000;

export interface PostgresContainerOptions {
  image?: string;
  database?: string;
  username?: string;
  password?: string;
  startupTimeoutMs?: number;
}

export type PostgresEntityList = NonNullable<
  PostgresConnectionOptions["entities"]
>;

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

export function createPostgresContainerTypeOrmOptions(
  container: StartedPostgreSqlContainer,
  entities: PostgresEntityList = [],
  overrides: Partial<PostgresConnectionOptions> = {},
): PostgresConnectionOptions {
  return {
    type: "postgres",
    host: container.getHost(),
    port: container.getPort(),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
    entities,
    migrations: [],
    synchronize: true,
    dropSchema: true,
    logging: false,
    ssl: false,
    ...overrides,
  };
}
