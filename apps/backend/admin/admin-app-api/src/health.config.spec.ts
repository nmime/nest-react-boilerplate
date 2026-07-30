// @requirements REQ-AUTH-TENANT-004
import type { FactoryProvider, InjectionToken, OptionalFactoryDependency } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  DurableDatabaseRuntimeInjectToken,
  type DurableDatabaseProviderId,
  type DurableDatabaseRuntime,
} from '@app/backend-common-bootstrap';
import type { HealthIndicator, HealthService } from '@app/backend-common-health';
import type { NatsHealthIndicator } from '@app/backend-common-nats';
import type { RedisHealthIndicator } from '@app/backend-common-redis';
import { createAdminAppHealthServiceProvider } from './health.config';

type HealthFactory = (...dependencies: unknown[]) => HealthService;

// The wired indicators only need the HealthIndicator surface; building real
// Redis/NATS indicators would require live clients.
const fakeDependencyIndicator = (name: string) =>
  ({
    name,
    required: true,
    check: () => ({ name, status: 'ok' as const, required: true }),
  }) as unknown as RedisHealthIndicator & NatsHealthIndicator;

const findCheck = async (service: HealthService, name: string) => {
  const response = await service.check('health');
  const check = response.checks.find((entry) => entry.name === name);
  expect(check).toBeDefined();
  return check;
};

const createService = (provider: FactoryProvider<HealthService>, ...dependencies: unknown[]) =>
  (provider.useFactory as HealthFactory)(...dependencies);

const fakeIndicator = (name: string, status: 'error' | 'ok' = 'ok', details: Record<string, unknown> = {}) =>
  ({
    name,
    required: true,
    check: () => ({ name, status, required: true, details }),
  }) as HealthIndicator;

const fakeRuntime = (
  provider: DurableDatabaseProviderId,
  healthIndicators: readonly HealthIndicator[],
): DurableDatabaseRuntime => ({
  provider,
  healthIndicators,
  createSessionStore: () => {
    throw new Error('Session storage is not used by health tests.');
  },
});

const postgresRuntime = (migrationStatus: 'error' | 'ok' = 'ok') =>
  fakeRuntime('postgres', [
    fakeIndicator('postgres', 'ok', { reachable: true }),
    fakeIndicator('postgres-migrations', migrationStatus, { pending: migrationStatus === 'ok' ? 0 : 1 }),
  ]);

const mongoRuntime = (status: 'error' | 'ok' = 'ok') =>
  fakeRuntime('mongodb', [
    fakeIndicator('mongodb', status, { reachable: status === 'ok' }),
    fakeIndicator('mongodb-transactions', status, { transactionCapable: status === 'ok', topology: 'replica-set' }),
    fakeIndicator('mongodb-migrations', status, { applied: status === 'ok' }),
  ]);

const injectionTokens = (provider: FactoryProvider<HealthService>): InjectionToken[] =>
  (provider.inject ?? []).map((dependency) =>
    typeof dependency === 'object' && 'token' in dependency
      ? (dependency as OptionalFactoryDependency).token
      : (dependency as InjectionToken),
  );

describe('AdminAppHealthServiceProvider', () => {
  it('reports skipped redis and nats indicators when none are wired', async () => {
    const service = createService(createAdminAppHealthServiceProvider(), postgresRuntime());

    const redis = await findCheck(service, 'redis');
    expect(redis?.status).toBe('ok');
    expect(redis?.required).toBe(false);
    expect(redis?.details).toMatchObject({
      skipped: true,
      reason: 'not_configured',
    });

    const nats = await findCheck(service, 'nats');
    expect(nats?.details).toMatchObject({ skipped: true });
  });

  it('wraps wired redis and nats indicators as optional dependencies', async () => {
    const service = createService(
      createAdminAppHealthServiceProvider(),
      postgresRuntime(),
      fakeDependencyIndicator('redis'),
      fakeDependencyIndicator('nats'),
    );

    const redis = await findCheck(service, 'redis');
    expect(redis?.status).toBe('ok');
    expect(redis?.required).toBe(false);

    const nats = await findCheck(service, 'nats');
    expect(nats?.required).toBe(false);
  });

  it('reports required Postgres readiness and optional migration status under stable names', async () => {
    const service = createService(createAdminAppHealthServiceProvider(), postgresRuntime());

    await expect(findCheck(service, 'database')).resolves.toMatchObject({ status: 'ok', required: true });
    await expect(findCheck(service, 'database-migrations')).resolves.toMatchObject({
      status: 'ok',
      required: false,
      details: { pending: 0 },
    });
  });

  it('degrades without failing readiness when Postgres migrations are pending', async () => {
    const service = createService(createAdminAppHealthServiceProvider(), postgresRuntime('error'));
    const readiness = await service.checkReadiness();

    expect(readiness.data.status).toBe('degraded');
    expect(readiness.data.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'database-migrations',
          status: 'error',
          required: false,
          details: expect.objectContaining({ pending: 1 }),
        }),
      ]),
    );
  });

  it('requires Mongo readiness and transaction topology without injecting Postgres', async () => {
    const provider = createAdminAppHealthServiceProvider();
    const service = createService(provider, mongoRuntime());

    expect(injectionTokens(provider)).toContain(DurableDatabaseRuntimeInjectToken);
    await expect(findCheck(service, 'database')).resolves.toMatchObject({ status: 'ok', required: true });
    await expect(findCheck(service, 'database-transactions')).resolves.toMatchObject({
      status: 'ok',
      required: true,
      details: expect.objectContaining({ transactionCapable: true }),
    });
    await expect(findCheck(service, 'database-migrations')).resolves.toMatchObject({ status: 'ok', required: true });
    expect((await service.check('ready')).checks.some(({ name }) => name.includes('postgres'))).toBe(false);
  });

  it('fails readiness safely when the selected Mongo database is unavailable', async () => {
    const service = createService(createAdminAppHealthServiceProvider(), mongoRuntime('error'));
    const readiness = await service.checkReadiness();

    expect(readiness.data.status).toBe('error');
    expect(readiness.data.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'database', status: 'error', required: true }),
        expect.objectContaining({ name: 'database-transactions', status: 'error', required: true }),
      ]),
    );
    expect(JSON.stringify(readiness)).not.toContain('mongodb://');
  });

  it('fails readiness when the selected database runtime is not wired', async () => {
    const service = createService(createAdminAppHealthServiceProvider());

    await expect(findCheck(service, 'database')).resolves.toMatchObject({ status: 'error', required: true });
    await expect(service.checkReadiness()).resolves.toMatchObject({ data: { status: 'error' } });
  });

  it('preserves extra Postgres indicator names as optional dependencies', async () => {
    const service = createService(
      createAdminAppHealthServiceProvider(),
      fakeRuntime('postgres', [
        fakeIndicator('postgres'),
        fakeIndicator('postgres-migrations'),
        fakeIndicator('postgres-replica'),
      ]),
    );

    await expect(findCheck(service, 'postgres-replica')).resolves.toMatchObject({ status: 'ok', required: false });
  });
});
