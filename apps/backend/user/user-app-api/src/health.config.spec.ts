import type { FactoryProvider } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HealthService } from '@app/backend-common-health';
import type { NatsHealthIndicator } from '@app/backend-common-nats';
import type { RedisHealthIndicator } from '@app/backend-common-redis';
import { UserAppHealthServiceProvider } from './health.config';

type HealthFactory = (
  orm?: undefined,
  redisHealth?: RedisHealthIndicator,
  natsHealth?: NatsHealthIndicator,
) => HealthService;

const createService = (UserAppHealthServiceProvider as FactoryProvider).useFactory as HealthFactory;

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

describe('UserAppHealthServiceProvider', () => {
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

  it('reports session config ok when a secret and cookie name are set', async () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    vi.stubEnv('SESSION_COOKIE_NAME', 'sid');
    const service = createService();

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
    const service = createService();

    const sessionConfig = await findCheck(service, 'session-config');
    expect(sessionConfig?.status).toBe('degraded');
    expect(sessionConfig?.details).toHaveProperty('secretConfigured');
  });
});
