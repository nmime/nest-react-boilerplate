// @requirements REQ-SOCIAL-INGRESS-001
import type { FactoryProvider } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { HealthService } from '@app/backend-common-health';
import type { RedisHealthIndicator } from '@app/backend-common-redis';
import { DiscordAppApiHealthServiceProvider } from './health.config';

type RedisHealthDependency = Pick<RedisHealthIndicator, 'check' | 'name'>;
type HealthFactory = (redisHealth: RedisHealthDependency) => HealthService;
const createService = (DiscordAppApiHealthServiceProvider as FactoryProvider).useFactory as HealthFactory;
const redisHealth = {
  name: 'redis',
  check: async () => ({ name: 'redis', status: 'ok' as const }),
} satisfies RedisHealthDependency;

describe('DiscordAppApiHealthServiceProvider', () => {
  it('identifies the app and requires the public interaction configuration', async () => {
    const service = createService(redisHealth);
    expect(service).toBeInstanceOf(HealthService);
    if (!(service instanceof HealthService)) {
      throw new Error('Discord health provider must contain a HealthService value.');
    }
    const previousApplicationId = process.env.DISCORD_APPLICATION_ID;
    const previousPublicKey = process.env.DISCORD_PUBLIC_KEY;

    delete process.env.DISCORD_APPLICATION_ID;
    delete process.env.DISCORD_PUBLIC_KEY;
    try {
      expect(service.appName).toBe('discord-app-api');
      const readiness = await service.checkReadiness();
      expect(readiness.data.status).toBe('error');
      expect(readiness.data.checks?.find(({ name }) => name === 'discord-bot-config')?.required).toBe(true);
      expect(readiness.data.checks?.find(({ name }) => name === 'redis')?.required).toBe(true);
    } finally {
      restoreEnv('DISCORD_APPLICATION_ID', previousApplicationId);
      restoreEnv('DISCORD_PUBLIC_KEY', previousPublicKey);
    }
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
