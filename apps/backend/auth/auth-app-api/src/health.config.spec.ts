import type { FactoryProvider } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HealthService } from '@app/backend-common-health';
import type { NatsHealthIndicator } from '@app/backend-common-nats';
import type { RedisHealthIndicator } from '@app/backend-common-redis';
import { AuthAppHealthServiceProvider } from './health.config';

type HealthFactory = (
  orm?: undefined,
  redisHealth?: RedisHealthIndicator,
  natsHealth?: NatsHealthIndicator,
) => HealthService;

const createService = (AuthAppHealthServiceProvider as FactoryProvider).useFactory as HealthFactory;

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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AuthAppHealthServiceProvider', () => {
  it('reports skipped redis and nats indicators when none are wired', async () => {
    const service = createService();

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
    const service = createService(undefined, fakeDependencyIndicator('redis'), fakeDependencyIndicator('nats'));

    const redis = await findCheck(service, 'redis');
    expect(redis?.status).toBe('ok');
    expect(redis?.required).toBe(false);

    const nats = await findCheck(service, 'nats');
    expect(nats?.required).toBe(false);
  });

  it('reports memory persistence mode when explicitly configured', async () => {
    vi.stubEnv('AUTH_PERSISTENCE', 'memory');
    const service = createService();

    const persistence = await findCheck(service, 'auth-persistence');
    expect(persistence?.status).toBe('ok');
    expect(persistence?.required).toBe(true);
    expect(persistence?.details).toMatchObject({
      mode: 'memory',
      postgresRequired: false,
    });
  });

  it('reports postgres persistence mode when explicitly configured', async () => {
    vi.stubEnv('AUTH_PERSISTENCE', 'postgres');
    const service = createService();

    const persistence = await findCheck(service, 'auth-persistence');
    expect(persistence?.details).toMatchObject({
      mode: 'postgres',
      postgresRequired: true,
    });
  });
});
