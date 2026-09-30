// @requirements REQ-RUNTIME-DATABASE-008 REQ-RUNTIME-HEALTH-001
import { MikroORM } from '@mikro-orm/core';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PostgresMainModule } from './postgres.module';
import { PostgresSessionStore } from './postgres-session.store';
import { PostgresHealthAdapter, PostgresReadinessHealthIndicator } from './postgres.health';

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

  it('injects the selected ORM into readiness and treats a missing adapter as required failure', async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const providers = PostgresMainModule.forRoot().providers ?? [];
    const moduleRef = await Test.createTestingModule({
      providers: [...providers, { provide: MikroORM, useValue: { em: { getConnection: () => ({ execute }) } } }],
    }).compile();
    const readiness = moduleRef.get(PostgresReadinessHealthIndicator);
    await expect(readiness.check()).resolves.toMatchObject({ status: 'ok', details: { skipped: false } });
    expect(execute).toHaveBeenCalledWith('select 1');
    execute.mockRejectedValue(new Error('owned database unavailable'));
    await expect(readiness.check()).resolves.toMatchObject({ status: 'error' });
    await moduleRef.close();

    const missingAdapter = await Test.createTestingModule({
      providers: [...providers, { provide: MikroORM, useValue: {} }],
    })
      .overrideProvider(PostgresHealthAdapter)
      .useValue(null)
      .compile();
    await expect(missingAdapter.get(PostgresReadinessHealthIndicator).check()).resolves.toMatchObject({
      status: 'error',
      details: { skipped: false, reason: 'not_configured' },
    });
    await missingAdapter.close();
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
