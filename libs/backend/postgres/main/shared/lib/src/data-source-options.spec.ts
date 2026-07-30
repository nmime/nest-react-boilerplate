// @requirements REQ-RUNTIME-DATABASE-008
// Evidence for: REQ-RUNTIME-DATABASE-008
import { Migrator } from '@mikro-orm/migrations';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import { PostgresMigrationsTableName, createPostgresMikroOrmOptions } from './data-source-options';
import {
  DefaultPostgresDatabase,
  DefaultPostgresHost,
  DefaultPostgresPoolIdleTimeoutMs,
  DefaultPostgresPoolMax,
  DefaultPostgresPoolMin,
  DefaultPostgresPort,
  DefaultPostgresUser,
  PostgresDatabaseConfigService,
  createPostgresEnvironment,
  readBoolean,
  readPort,
  readSslRejectUnauthorized,
} from './database.config';

describe('Postgres MikroORM options', () => {
  it('uses secure local defaults without automatic schema sync', () => {
    expect(createPostgresMikroOrmOptions({}, {})).toMatchObject({
      driver: PostgreSqlDriver,
      host: DefaultPostgresHost,
      port: DefaultPostgresPort,
      user: DefaultPostgresUser,
      dbName: DefaultPostgresDatabase,
      debug: false,
      driverOptions: {},
      entities: [],
      extensions: [Migrator],
      migrations: {
        tableName: PostgresMigrationsTableName,
        transactional: true,
        allOrNothing: true,
      },
      autoLoadEntities: true,
      pool: {
        min: DefaultPostgresPoolMin,
        max: DefaultPostgresPoolMax,
        idleTimeoutMillis: DefaultPostgresPoolIdleTimeoutMs,
      },
    });
    expect(createPostgresMikroOrmOptions({}, {})).not.toHaveProperty('slowQueryThreshold');
  });

  it('reads env-driven pool sizing and slow-query threshold', () => {
    const options = createPostgresMikroOrmOptions(
      {},
      {
        POSTGRES_POOL_MIN: '5',
        POSTGRES_POOL_MAX: '50',
        POSTGRES_POOL_IDLE_TIMEOUT_MS: '30000',
        POSTGRES_SLOW_QUERY_MS: '250',
      },
    );

    expect(options).toMatchObject({
      pool: { min: 5, max: 50, idleTimeoutMillis: 30000 },
      slowQueryThreshold: 250,
    });

    const service = new PostgresDatabaseConfigService();
    expect(service.poolMin).toBe(DefaultPostgresPoolMin);
    expect(service.poolMax).toBe(DefaultPostgresPoolMax);
    expect(service.poolIdleTimeoutMs).toBe(DefaultPostgresPoolIdleTimeoutMs);
    expect(service.slowQueryMs).toBeUndefined();
  });

  it('rejects non-numeric pool and slow-query values', () => {
    expect(() => createPostgresMikroOrmOptions({}, { POSTGRES_POOL_MAX: 'lots' })).toThrow(
      /Invalid environment configuration.*POSTGRES_POOL_MAX/u,
    );
    expect(() => createPostgresMikroOrmOptions({}, { POSTGRES_SLOW_QUERY_MS: 'slow' })).toThrow(
      /Invalid environment configuration.*POSTGRES_SLOW_QUERY_MS/u,
    );
  });

  it('prefers DATABASE_URL when provided', () => {
    expect(
      createPostgresMikroOrmOptions({}, { DATABASE_URL: 'postgres://user:pass@db.example:5432/app' }),
    ).toMatchObject({
      driver: PostgreSqlDriver,
      clientUrl: 'postgres://user:pass@db.example:5432/app',
      migrations: { tableName: PostgresMigrationsTableName },
      debug: false,
    });
  });

  it('reads POSTGRES_* values and SSL options', () => {
    expect(
      createPostgresMikroOrmOptions(
        {},
        {
          POSTGRES_HOST: 'db',
          POSTGRES_PORT: '15432',
          POSTGRES_USER: 'app',
          POSTGRES_PASSWORD: 'secret',
          POSTGRES_DB: 'app_db',
          POSTGRES_SSL: 'true',
          POSTGRES_SSL_REJECT_UNAUTHORIZED: 'false',
          POSTGRES_LOGGING: 'on',
        },
      ),
    ).toMatchObject({
      host: 'db',
      port: 15432,
      user: 'app',
      password: 'secret',
      dbName: 'app_db',
      driverOptions: {
        connection: { ssl: { rejectUnauthorized: false } },
      },
      debug: true,
    });
  });

  it('allows caller overrides while keeping the PostgreSQL driver', () => {
    expect(
      createPostgresMikroOrmOptions(
        { dbName: 'override', debug: true, entities: ['./dist/entities'] },
        { POSTGRES_DB: 'env_db' },
      ),
    ).toMatchObject({
      dbName: 'override',
      debug: true,
      entities: ['./dist/entities'],
      driver: PostgreSqlDriver,
    });
  });

  it('parses booleans and ports defensively', () => {
    expect(readBoolean(undefined)).toBeUndefined();
    expect(readBoolean('1')).toBe(true);
    expect(readBoolean(' yes ')).toBe(true);
    expect(readBoolean('FALSE')).toBe(false);
    expect(readBoolean('off')).toBe(false);
    expect(() => readBoolean('maybe', 'TEST_FLAG')).toThrow('TEST_FLAG must be a boolean value.');
    expect(readPort(undefined)).toBe(DefaultPostgresPort);
    expect(readPort(' 15432 ')).toBe(15432);
    expect(() => readPort('70000')).toThrow('Invalid POSTGRES_PORT: 70000');
    expect(() => readPort('5432abc')).toThrow('Invalid POSTGRES_PORT: 5432abc');
    expect(() => readPort('not-a-number')).toThrow('Invalid POSTGRES_PORT: not-a-number');
    expect(readSslRejectUnauthorized({ POSTGRES_SSL_REJECT_UNAUTHORIZED: 'true' })).toBe(true);
    expect(
      createPostgresEnvironment({
        POSTGRES_PORT: '15432',
        POSTGRES_SSL: 'true',
        POSTGRES_LOGGING: 'yes',
      }),
    ).toMatchObject({
      POSTGRES_PORT: 15432,
      POSTGRES_SSL: true,
      POSTGRES_LOGGING: true,
    });
    expect(createPostgresEnvironment({}).POSTGRES_PORT).toBe(DefaultPostgresPort);
    expect(() =>
      readSslRejectUnauthorized({
        POSTGRES_SSL_REJECT_UNAUTHORIZED: 'definitely',
      }),
    ).toThrow('POSTGRES_SSL_REJECT_UNAUTHORIZED must be a boolean value.');
  });

  it('exposes every resolved setting through the config service getters', () => {
    const previousEnv = process.env;
    process.env = {
      ...previousEnv,
      DATABASE_URL: 'postgres://app:secret@db.example:5432/app_db',
      POSTGRES_HOST: 'db.example',
      POSTGRES_PORT: '15432',
      POSTGRES_USER: 'app',
      POSTGRES_PASSWORD: 'secret',
      POSTGRES_DB: 'app_db',
      POSTGRES_SSL: 'true',
      POSTGRES_SSL_REJECT_UNAUTHORIZED: 'false',
      POSTGRES_SYNCHRONIZE: 'false',
      POSTGRES_LOGGING: 'true',
      POSTGRES_POOL_MIN: '3',
      POSTGRES_POOL_MAX: '42',
      POSTGRES_POOL_IDLE_TIMEOUT_MS: '12345',
      POSTGRES_SLOW_QUERY_MS: '500',
    };

    try {
      const service = new PostgresDatabaseConfigService();
      expect(service.databaseUrl).toBe('postgres://app:secret@db.example:5432/app_db');
      expect(service.host).toBe('db.example');
      expect(service.port).toBe(15432);
      expect(service.user).toBe('app');
      expect(service.password).toBe('secret');
      expect(service.database).toBe('app_db');
      expect(service.ssl).toBe(true);
      expect(service.sslRejectUnauthorized).toBe(false);
      expect(service.synchronize).toBe(false);
      expect(service.logging).toBe(true);
      expect(service.poolMin).toBe(3);
      expect(service.poolMax).toBe(42);
      expect(service.poolIdleTimeoutMs).toBe(12345);
      expect(service.slowQueryMs).toBe(500);
      expect(service.values).toMatchObject({
        POSTGRES_HOST: 'db.example',
        POSTGRES_POOL_MAX: 42,
        POSTGRES_SLOW_QUERY_MS: 500,
      });
    } finally {
      process.env = previousEnv;
    }
  });

  it('rejects invalid SSL and logging booleans instead of silently disabling them', () => {
    expect(() => createPostgresMikroOrmOptions({}, { POSTGRES_SSL: 'treu' })).toThrow(
      /Invalid environment configuration.*POSTGRES_SSL/u,
    );
    expect(() => createPostgresMikroOrmOptions({}, { POSTGRES_LOGGING: 'enabled' })).toThrow(
      /Invalid environment configuration.*POSTGRES_LOGGING/u,
    );
  });
});
