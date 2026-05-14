import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";
import {
  DefaultPostgresDatabase,
  DefaultPostgresHost,
  DefaultPostgresUser,
  type PostgresEnvironment,
  readBoolean,
  readPort,
  readSslRejectUnauthorized,
} from "./database.config";

export type PostgresDataSourceOverrides = Partial<PostgresConnectionOptions>;

export function createPostgresDataSourceOptions(
  overrides: PostgresDataSourceOverrides = {},
  env: PostgresEnvironment = process.env,
): PostgresConnectionOptions {
  const connection: PostgresConnectionOptions = env.DATABASE_URL
    ? {
        type: "postgres",
        url: env.DATABASE_URL,
      }
    : {
        type: "postgres",
        host: env.POSTGRES_HOST ?? DefaultPostgresHost,
        port: readPort(env.POSTGRES_PORT),
        username: env.POSTGRES_USER ?? DefaultPostgresUser,
        password: env.POSTGRES_PASSWORD,
        database: env.POSTGRES_DB ?? DefaultPostgresDatabase,
      };

  return {
    ...connection,
    entities: [],
    migrations: [],
    logging: readBoolean(env.POSTGRES_LOGGING) ?? false,
    ssl: readBoolean(env.POSTGRES_SSL)
      ? { rejectUnauthorized: readSslRejectUnauthorized(env) }
      : false,
    synchronize: readBoolean(env.POSTGRES_SYNCHRONIZE) ?? false,
    ...overrides,
    type: "postgres",
  };
}
