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
import { createUserAppHealthServiceProvider } from './health.config';

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

const fakeIndicator = (name: string, details: Record<string, unknown> = {}) =>
  ({
    name,
    required: true,
    check: () => ({ name, status: 'ok' as const, required: true, details }),
  }) as HealthIndicator;

const fakeRuntime = (provider: DurableDatabaseProviderId): DurableDatabaseRuntime => ({
  provider,
  healthIndicators:
    provider === 'mongodb'
      ? [
          fakeIndicator('mongodb', { reachable: true }),
          fakeIndicator('mongodb-transactions', { transactionCapable: true, topology: 'replica-set' }),
          fakeIndicator('mongodb-migrations', { applied: true }),
        ]
      : [fakeIndicator('postgres', { reachable: true }), fakeIndicator('postgres-migrations', { pending: 0 })],
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

describe('UserAppHealthServiceProvider', () => {
  it('reports skipped redis and nats indicators when none are wired', async () => {
    const service = createService(createUserAppHealthServiceProvider(), fakeRuntime('postgres'));

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
      createUserAppHealthServiceProvider(),
      fakeRuntime('postgres'),
      fakeDependencyIndicator('redis'),
      fakeDependencyIndicator('nats'),
    );

    const redis = await findCheck(service, 'redis');
    expect(redis?.status).toBe('ok');
    expect(redis?.required).toBe(false);

    const nats = await findCheck(service, 'nats');
    expect(nats?.required).toBe(false);
  });

  it('requires selected Postgres readiness while keeping migration status optional', async () => {
    const service = createService(createUserAppHealthServiceProvider(), fakeRuntime('postgres'));

    await expect(findCheck(service, 'database')).resolves.toMatchObject({ status: 'ok', required: true });
    await expect(findCheck(service, 'database-migrations')).resolves.toMatchObject({ status: 'ok', required: false });
  });

  it('reports Mongo transaction readiness without cross-provider injection', async () => {
    const provider = createUserAppHealthServiceProvider();
    const service = createService(provider, fakeRuntime('mongodb'));

    expect(injectionTokens(provider)).toContain(DurableDatabaseRuntimeInjectToken);
    await expect(findCheck(service, 'database-transactions')).resolves.toMatchObject({
      status: 'ok',
      required: true,
    });
    await expect(findCheck(service, 'database-migrations')).resolves.toMatchObject({ status: 'ok', required: true });
    expect((await service.check()).checks.some(({ name }) => name.includes('postgres'))).toBe(false);
  });

  it('reports session config ok when a secret and cookie name are set', async () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    vi.stubEnv('SESSION_COOKIE_NAME', 'sid');
    const service = createService(createUserAppHealthServiceProvider(), fakeRuntime('postgres'));

    const sessionConfig = await findCheck(service, 'session-config');
    expect(sessionConfig?.status).toBe('ok');
    // Detail values are redacted by the health service's secret scrubbing;
    // the ok/degraded status is the meaningful signal.
    expect(sessionConfig?.details).toHaveProperty('cookieNameConfigured');
    expect(sessionConfig?.details).toHaveProperty('secretConfigured');
  });

  it('degrades session config when no secret is configured', async () => {
    vi.stubEnv('SESSION_SECRET', '');
    vi.stubEnv('SESSION_COOKIE_NAME', '');
    const service = createService(createUserAppHealthServiceProvider(), fakeRuntime('postgres'));

    const sessionConfig = await findCheck(service, 'session-config');
    expect(sessionConfig?.status).toBe('degraded');
    expect(sessionConfig?.details).toHaveProperty('secretConfigured');
  });
});
