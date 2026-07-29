import type { FactoryProvider, InjectionToken, OptionalFactoryDependency } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DurableDatabaseRuntimeInjectToken,
  type DurableDatabaseProviderId,
  type DurableDatabaseRuntime,
} from '@app/backend-common-bootstrap';
import type { HealthIndicator, HealthService } from '@app/backend-common-health';
import type { NatsHealthIndicator } from '@app/backend-common-nats';
import type { RedisHealthIndicator } from '@app/backend-common-redis';
import { createAuthAppHealthServiceProvider } from './health.config';

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

const fakeRuntime = (provider: DurableDatabaseProviderId, status: 'error' | 'ok' = 'ok'): DurableDatabaseRuntime => ({
  provider,
  healthIndicators:
    provider === 'mongodb'
      ? [
          fakeIndicator('mongodb', status, { reachable: status === 'ok' }),
          fakeIndicator('mongodb-transactions', status, { transactionCapable: status === 'ok' }),
          fakeIndicator('mongodb-migrations', status, { applied: status === 'ok' }),
        ]
      : [fakeIndicator('postgres', status), fakeIndicator('postgres-migrations', status, { pending: 0 })],
  createSessionStore: () => {
    throw new Error('Session storage is not used by health tests.');
  },
});

const injectionTokens = (provider: FactoryProvider<HealthService>): InjectionToken[] =>
  (provider.inject ?? []).map((dependency) =>
    typeof dependency === 'object' && 'token' in dependency
      ? (dependency as OptionalFactoryDependency).token
      : (dependency as InjectionToken),
  );

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AuthAppHealthServiceProvider', () => {
  it('reports skipped redis and nats indicators when none are wired', async () => {
    const service = createService(createAuthAppHealthServiceProvider());

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
      createAuthAppHealthServiceProvider(),
      undefined,
      fakeDependencyIndicator('redis'),
      fakeDependencyIndicator('nats'),
    );

    const redis = await findCheck(service, 'redis');
    expect(redis?.status).toBe('ok');
    expect(redis?.required).toBe(false);

    const nats = await findCheck(service, 'nats');
    expect(nats?.required).toBe(false);
  });

  it('reports memory persistence mode when explicitly configured', async () => {
    vi.stubEnv('AUTH_PERSISTENCE', 'memory');
    const provider = createAuthAppHealthServiceProvider();
    const service = createService(provider);

    const persistence = await findCheck(service, 'auth-persistence');
    expect(persistence?.status).toBe('ok');
    expect(persistence?.required).toBe(true);
    expect(persistence?.details).toMatchObject({
      mode: 'memory',
      databaseRequired: false,
    });
    expect(injectionTokens(provider)).toContain(DurableDatabaseRuntimeInjectToken);
    expect((await service.check()).checks.some(({ name }) => name.startsWith('database'))).toBe(false);
  });

  it('reports postgres persistence mode when explicitly configured', async () => {
    vi.stubEnv('AUTH_PERSISTENCE', 'postgres');
    const provider = createAuthAppHealthServiceProvider();
    const service = createService(provider, fakeRuntime('postgres'));

    const persistence = await findCheck(service, 'auth-persistence');
    expect(persistence?.details).toMatchObject({
      mode: 'postgres',
      databaseRequired: true,
    });
    expect(injectionTokens(provider)).toContain(DurableDatabaseRuntimeInjectToken);
    await expect(findCheck(service, 'database')).resolves.toMatchObject({ status: 'ok', required: true });
    await expect(findCheck(service, 'database-migrations')).resolves.toMatchObject({ status: 'ok', required: false });
  });

  it('requires Mongo reachability and transaction topology without injecting Postgres', async () => {
    const provider = createAuthAppHealthServiceProvider();
    const service = createService(provider, fakeRuntime('mongodb'));

    expect(injectionTokens(provider)).toContain(DurableDatabaseRuntimeInjectToken);
    await expect(findCheck(service, 'database')).resolves.toMatchObject({ status: 'ok', required: true });
    await expect(findCheck(service, 'database-transactions')).resolves.toMatchObject({
      status: 'ok',
      required: true,
      details: expect.objectContaining({ transactionCapable: true }),
    });
    await expect(findCheck(service, 'database-migrations')).resolves.toMatchObject({ status: 'ok', required: true });
    expect((await service.check()).checks.some(({ name }) => name.includes('postgres'))).toBe(false);
  });

  it('fails readiness safely for unavailable MongoDB', async () => {
    const service = createService(createAuthAppHealthServiceProvider(), fakeRuntime('mongodb', 'error'));
    const readiness = await service.checkReadiness();

    expect(readiness.data.status).toBe('error');
    expect(JSON.stringify(readiness)).not.toContain('mongodb://');
  });
});
