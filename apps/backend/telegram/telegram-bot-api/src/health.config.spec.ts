// @requirements REQ-SOCIAL-INGRESS-001
import type { FactoryProvider } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { HealthService } from '@app/backend-common-health';
import type { RedisHealthIndicator } from '@app/backend-common-redis';
import { TelegramBotApiHealthServiceProvider } from './health.config';

type RedisHealthDependency = Pick<RedisHealthIndicator, 'check' | 'name'>;
type HealthFactory = (redisHealth?: RedisHealthDependency) => HealthService;
const createService = (TelegramBotApiHealthServiceProvider as FactoryProvider).useFactory as HealthFactory;

describe('TelegramBotApiHealthServiceProvider', () => {
  it('makes Redis a required readiness dependency when webhook replay storage is wired', async () => {
    const redisHealth = {
      name: 'redis',
      check: async () => ({ name: 'redis', status: 'error' as const }),
    } satisfies RedisHealthDependency;

    const readiness = await createService(redisHealth).checkReadiness();

    expect(readiness.data.status).toBe('error');
    expect(readiness.data.checks?.find(({ name }) => name === 'redis')?.required).toBe(true);
  });

  it('does not add a Redis dependency in polling mode composition', async () => {
    const readiness = await createService().checkReadiness();

    expect(readiness.data.checks?.some(({ name }) => name === 'redis')).toBe(false);
  });
});
