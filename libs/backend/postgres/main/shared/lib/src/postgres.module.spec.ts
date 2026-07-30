// @requirements REQ-RUNTIME-DATABASE-008
import { afterEach, describe, expect, it } from 'vitest';
import { PostgresMainModule } from './postgres.module';
import { PostgresSessionStore } from './postgres-session.store';

interface DurableRuntimeForTest {
  readonly healthIndicators: readonly unknown[];
  readonly provider: 'postgres';
  createSessionStore(options: {
    defaultMaxAgeSeconds: number;
    env: NodeJS.ProcessEnv;
    sweepIntervalMs: number;
  }): PostgresSessionStore;
  onModuleInit(): void;
}

function durableRuntimeFactory(): (readiness: unknown, migrations: unknown) => DurableRuntimeForTest {
  const providers = PostgresMainModule.forRoot().providers;
  const provider = providers?.find(
    (candidate) =>
      typeof candidate !== 'function' &&
      'provide' in candidate &&
      typeof candidate.provide === 'function' &&
      candidate.provide.name === 'PostgresDurableDatabaseRuntime',
  );
  if (provider === undefined || typeof provider === 'function' || !('useFactory' in provider)) {
    throw new Error('Expected the PostgreSQL durable database runtime provider.');
  }
  return provider.useFactory as (readiness: unknown, migrations: unknown) => DurableRuntimeForTest;
}

describe('PostgresMainModule', () => {
  const originalEnvironment = process.env;

  afterEach(() => {
    process.env = originalEnvironment;
  });

  it('creates a dynamic MikroORM root module', async () => {
    const dynamicModule = PostgresMainModule.forRoot({
      dbName: 'module_test',
    });

    expect(dynamicModule.module).toBe(PostgresMainModule);
    expect(dynamicModule.imports).toHaveLength(1);
    await expect(dynamicModule.imports?.[0]).resolves.toMatchObject({
      module: expect.any(Function) as unknown,
    });
  });

  it('exposes the selected provider and its health indicators through the durable runtime', () => {
    process.env = {
      ...originalEnvironment,
      AUTH_PERSISTENCE: 'postgres',
      DATABASE_ENGINE: 'postgres',
      NODE_ENV: 'test',
    };
    const readiness = { name: 'readiness' };
    const migrations = { name: 'migrations' };
    const runtime = durableRuntimeFactory()(readiness, migrations);

    expect(runtime.provider).toBe('postgres');
    expect(runtime.healthIndicators).toEqual([readiness, migrations]);
    expect(() => {
      runtime.onModuleInit();
    }).not.toThrow();
  });

  it('requires a database URL when creating a PostgreSQL session store', async () => {
    const runtime = durableRuntimeFactory()({}, {});
    const options = { defaultMaxAgeSeconds: 3600, env: {}, sweepIntervalMs: 60_000 };

    expect(() => runtime.createSessionStore(options)).toThrow(
      'DATABASE_URL is required for PostgreSQL-backed server-side sessions.',
    );

    const store = runtime.createSessionStore({
      ...options,
      env: { DATABASE_URL: '  postgres://database/app  ' },
    });
    expect(store).toBeInstanceOf(PostgresSessionStore);
    await store.close();
  });
});
