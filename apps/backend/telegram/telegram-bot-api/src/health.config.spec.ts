// @requirements REQ-SOCIAL-INGRESS-001
import type { FactoryProvider, InjectionToken, OptionalFactoryDependency } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import type { HealthService } from '@app/backend-common-health';
import { RedisHealthIndicator } from '@app/backend-common-redis';
import { createTelegramBotApiHealthServiceProvider } from './health.config';

type HealthFactory = (...dependencies: unknown[]) => HealthService;

const createService = (provider: FactoryProvider<HealthService>, ...dependencies: unknown[]) =>
  (provider.useFactory as HealthFactory)(...dependencies);

const injectionTokens = (provider: FactoryProvider<HealthService>): InjectionToken[] =>
  (provider.inject ?? []).map((dependency) =>
    typeof dependency === 'object' && 'token' in dependency
      ? (dependency as OptionalFactoryDependency).token
      : (dependency as InjectionToken),
  );

const previousToken = process.env.TELEGRAM_BOT_TOKEN;
const previousSecret = process.env.TELEGRAM_BOT_WEBHOOK_SECRET;

afterEach(() => {
  restoreEnv('TELEGRAM_BOT_TOKEN', previousToken);
  restoreEnv('TELEGRAM_BOT_WEBHOOK_SECRET', previousSecret);
});

describe('TelegramBotApiHealthServiceProvider', () => {
  it('reports readiness without inventing a durable database dependency', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:test';
    process.env.TELEGRAM_BOT_WEBHOOK_SECRET = 'secret';
    const provider = createTelegramBotApiHealthServiceProvider();

    const readiness = await createService(provider).checkReadiness();

    expect(readiness.data.status).not.toBe('error');
    expect(readiness.data.checks?.some(({ name }) => name.startsWith('database'))).toBe(false);
    expect(injectionTokens(provider)).toEqual([RedisHealthIndicator]);
  });

  it('makes Redis a required readiness dependency when webhook replay storage is wired', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:test';
    process.env.TELEGRAM_BOT_WEBHOOK_SECRET = 'secret';
    const redisHealth = {
      name: 'redis',
      check: async () => ({ name: 'redis', status: 'error' as const }),
    } satisfies Pick<RedisHealthIndicator, 'check' | 'name'>;

    const readiness = await createService(createTelegramBotApiHealthServiceProvider(), redisHealth).checkReadiness();

    expect(readiness.data.status).toBe('error');
    expect(readiness.data.checks?.find(({ name }) => name === 'redis')?.required).toBe(true);
  });

  it('does not add a Redis dependency in polling mode composition', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:test';
    process.env.TELEGRAM_BOT_WEBHOOK_SECRET = 'secret';

    const readiness = await createService(createTelegramBotApiHealthServiceProvider()).checkReadiness();

    expect(readiness.data.checks?.some(({ name }) => name === 'redis')).toBe(false);
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
