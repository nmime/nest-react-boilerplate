import type { MigrationsOptions } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import type { MikroOrmModuleSyncOptions } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { createPostgresEnvironment, type PostgresEnvironment } from './database.config';
import { createPostgresConnectionOptions } from './postgres-connection-options';

export const PostgresMigrationsTableName = 'mikro_orm_migrations';

export const defaultPostgresMigrationOptions: MigrationsOptions = {
  tableName: PostgresMigrationsTableName,
  transactional: true,
  allOrNothing: true,
};

export type PostgresMikroOrmOptions = MikroOrmModuleSyncOptions;
export type PostgresMikroOrmOverrides = Partial<PostgresMikroOrmOptions>;

export function createPostgresMikroOrmOptions(
  overrides: PostgresMikroOrmOverrides = {},
  env: Partial<PostgresEnvironment> | NodeJS.ProcessEnv | Record<string, unknown> = process.env,
): PostgresMikroOrmOptions {
  const config = createPostgresEnvironment(env);
  const connection: PostgresMikroOrmOptions = config.DATABASE_URL
    ? {
        clientUrl: config.DATABASE_URL,
      }
    : {
        host: config.POSTGRES_HOST,
        port: config.POSTGRES_PORT,
        user: config.POSTGRES_USER,
        password: config.POSTGRES_PASSWORD,
        dbName: config.POSTGRES_DB,
      };

  return {
    ...connection,
    driver: PostgreSqlDriver,
    entities: [],
    extensions: [Migrator],
    autoLoadEntities: true,
    debug: config.POSTGRES_LOGGING,
    pool: {
      min: config.POSTGRES_POOL_MIN,
      max: config.POSTGRES_POOL_MAX,
      idleTimeoutMillis: config.POSTGRES_POOL_IDLE_TIMEOUT_MS,
    },
    ...(config.POSTGRES_SLOW_QUERY_MS === undefined ? {} : { slowQueryThreshold: config.POSTGRES_SLOW_QUERY_MS }),
    // MikroORM 7 forwards driverOptions directly to pg.Pool; nested
    // driverOptions.connection is not a supported pool TLS setting.
    driverOptions: createPostgresConnectionOptions(config.DATABASE_URL, env),
    ...overrides,
    migrations: {
      ...defaultPostgresMigrationOptions,
      ...overrides.migrations,
    },
  };
}
