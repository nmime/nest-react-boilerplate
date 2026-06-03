import type { MigrationsOptions } from "@mikro-orm/core";
import { Migrator } from "@mikro-orm/migrations";
import type { MikroOrmModuleSyncOptions } from "@mikro-orm/nestjs";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import {
  DefaultPostgresDatabase,
  DefaultPostgresHost,
  DefaultPostgresUser,
  type PostgresEnvironment,
  readBoolean,
  readPort,
  readSslRejectUnauthorized,
} from "./database.config";

export const PostgresMigrationsTableName = "mikro_orm_migrations";

export const defaultPostgresMigrationOptions: MigrationsOptions = {
  tableName: PostgresMigrationsTableName,
  transactional: true,
  allOrNothing: true,
};

export type PostgresMikroOrmOptions = MikroOrmModuleSyncOptions;
export type PostgresMikroOrmOverrides = Partial<PostgresMikroOrmOptions>;

export function createPostgresMikroOrmOptions(
  overrides: PostgresMikroOrmOverrides = {},
  env: PostgresEnvironment = process.env,
): PostgresMikroOrmOptions {
  const connection: PostgresMikroOrmOptions = env.DATABASE_URL
    ? {
        clientUrl: env.DATABASE_URL,
      }
    : {
        host: env.POSTGRES_HOST ?? DefaultPostgresHost,
        port: readPort(env.POSTGRES_PORT),
        user: env.POSTGRES_USER ?? DefaultPostgresUser,
        password: env.POSTGRES_PASSWORD ?? "postgres",
        dbName: env.POSTGRES_DB ?? DefaultPostgresDatabase,
      };

  return {
    ...connection,
    driver: PostgreSqlDriver,
    entities: [],
    extensions: [Migrator],
    autoLoadEntities: true,
    debug: readBoolean(env.POSTGRES_LOGGING, "POSTGRES_LOGGING") ?? false,
    driverOptions: readBoolean(env.POSTGRES_SSL, "POSTGRES_SSL")
      ? {
          connection: {
            ssl: { rejectUnauthorized: readSslRejectUnauthorized(env) },
          },
        }
      : {},
    ...overrides,
    migrations: {
      ...defaultPostgresMigrationOptions,
      ...overrides.migrations,
    },
  };
}
