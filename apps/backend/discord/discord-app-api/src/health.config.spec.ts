// @requirements REQ-SOCIAL-INGRESS-001
import type { FactoryProvider, InjectionToken, OptionalFactoryDependency } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DurableDatabaseRuntimeInjectToken, type DurableDatabaseRuntime } from '@app/backend-common-bootstrap';
import type { HealthIndicator, HealthService } from '@app/backend-common-health';
import { RedisHealthIndicator } from '@app/backend-common-redis';
import { createDiscordAppApiHealthServiceProvider } from './health.config';

type HealthFactory = (...dependencies: unknown[]) => HealthService;

const createService = (provider: FactoryProvider<HealthService>, ...dependencies: unknown[]) =>
  (provider.useFactory as HealthFactory)(...dependencies);

const fakeIndicator = (name: string, details: Record<string, unknown> = {}) =>
  ({
    name,
    required: true,
    check: () => ({ name, status: 'ok' as const, required: true, details }),
  }) as HealthIndicator;

const mongoRuntime: DurableDatabaseRuntime = {
  provider: 'mongodb',
  healthIndicators: [
    fakeIndicator('mongodb', { reachable: true }),
    fakeIndicator('mongodb-transactions', { transactionCapable: true, topology: 'replica-set' }),
    fakeIndicator('mongodb-migrations', { applied: true }),
  ],
  createSessionStore: () => {
    throw new Error('Session storage is not used by health tests.');
  },
};

const postgresRuntime: DurableDatabaseRuntime = {
  ...mongoRuntime,
  provider: 'postgres',
  healthIndicators: [
    fakeIndicator('postgres', { reachable: true }),
    fakeIndicator('postgres-migrations', { pending: 0 }),
    fakeIndicator('postgres-replica', { reachable: true }),
  ],
};

const injectionTokens = (provider: FactoryProvider<HealthService>): InjectionToken[] =>
  (provider.inject ?? []).map((dependency) =>
    typeof dependency === 'object' && 'token' in dependency
      ? (dependency as OptionalFactoryDependency).token
      : (dependency as InjectionToken),
  );

type RedisHealthDependency = Pick<RedisHealthIndicator, 'check' | 'name'>;
const redisHealth = {
  name: 'redis',
  check: async () => ({ name: 'redis', status: 'ok' as const }),
} satisfies RedisHealthDependency;

describe('DiscordAppApiHealthServiceProvider', () => {
  it('identifies the app and requires the public interaction configuration', async () => {
    const provider = createDiscordAppApiHealthServiceProvider();
    const service = createService(provider, undefined, redisHealth);
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
      expect(injectionTokens(provider)).toEqual(
        expect.arrayContaining([DurableDatabaseRuntimeInjectToken, RedisHealthIndicator]),
      );
    } finally {
      restoreEnv('DISCORD_APPLICATION_ID', previousApplicationId);
      restoreEnv('DISCORD_PUBLIC_KEY', previousPublicKey);
    }
  });

  it('reports required Mongo transaction readiness and does not inject Postgres', async () => {
    const provider = createDiscordAppApiHealthServiceProvider();
    const service = createService(provider, mongoRuntime, redisHealth);
    const readiness = await service.checkReadiness();

    expect(injectionTokens(provider)).toContain(DurableDatabaseRuntimeInjectToken);
    expect(readiness.data.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'database', status: 'ok', required: true }),
        expect.objectContaining({ name: 'database-transactions', status: 'ok', required: true }),
        expect.objectContaining({ name: 'database-migrations', status: 'ok', required: true }),
      ]),
    );
    expect(readiness.data.dependencies?.some(({ name }) => name.includes('postgres'))).toBe(false);
  });

  it('keeps memory test mode free of database checks while retaining Redis readiness', async () => {
    const provider = createDiscordAppApiHealthServiceProvider();
    const service = createService(provider, undefined, redisHealth);

    expect(injectionTokens(provider)).toContain(DurableDatabaseRuntimeInjectToken);
    expect((await service.check()).checks.some(({ name }) => name.startsWith('database'))).toBe(false);
    await expect(service.checkReadiness()).resolves.toMatchObject({
      data: {
        dependencies: expect.arrayContaining([
          expect.objectContaining({ name: 'redis', status: 'ok', required: true }),
        ]),
      },
    });
  });

  it('fails readiness when durable persistence is selected without a runtime', async () => {
    const previousPersistence = process.env.AUTH_PERSISTENCE;
    process.env.AUTH_PERSISTENCE = 'postgres';

    try {
      const service = createService(createDiscordAppApiHealthServiceProvider(), undefined, redisHealth);

      await expect(service.checkReadiness()).resolves.toMatchObject({
        data: {
          status: 'error',
          dependencies: expect.arrayContaining([
            expect.objectContaining({ name: 'database', status: 'error', required: true }),
          ]),
        },
      });
    } finally {
      restoreEnv('AUTH_PERSISTENCE', previousPersistence);
    }
  });

  it('normalizes Postgres indicators while preserving provider-specific names', async () => {
    const service = createService(createDiscordAppApiHealthServiceProvider(), postgresRuntime, redisHealth);

    await expect(service.checkReadiness()).resolves.toMatchObject({
      data: {
        dependencies: expect.arrayContaining([
          expect.objectContaining({ name: 'database', required: true }),
          expect.objectContaining({ name: 'database-migrations', required: false }),
          expect.objectContaining({ name: 'postgres-replica', required: false }),
        ]),
      },
    });
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
