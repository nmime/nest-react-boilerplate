// @requirements REQ-SOCIAL-INGRESS-001
import type { FactoryProvider, InjectionToken, OptionalFactoryDependency } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DurableDatabaseRuntimeInjectToken, type DurableDatabaseRuntime } from '@app/backend-common-bootstrap';
import type { HealthIndicator, HealthService } from '@app/backend-common-health';
import { RedisHealthIndicator } from '@app/backend-common-redis';
import { createTelegramBotApiHealthServiceProvider } from './health.config';

type HealthFactory = (...dependencies: unknown[]) => HealthService;

const createService = (provider: FactoryProvider<HealthService>, ...dependencies: unknown[]) =>
  (provider.useFactory as HealthFactory)(...dependencies);

const fakeIndicator = (name: string, details: Record<string, unknown> = {}) =>
  ({
    name,
    required: true,
    check: () => ({ name, status: 'ok' as const, required: true, details }),
  }) as HealthIndicator;

const mongoRuntime = (migrationStatus: 'error' | 'ok' = 'ok'): DurableDatabaseRuntime => ({
  provider: 'mongodb',
  healthIndicators: [
    fakeIndicator('mongodb', { reachable: true }),
    fakeIndicator('mongodb-transactions', { transactionCapable: true, topology: 'replica-set' }),
    {
      ...fakeIndicator('mongodb-migrations', { applied: migrationStatus === 'ok' }),
      check: () => ({ name: 'mongodb-migrations', status: migrationStatus, required: true }),
    },
  ],
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

describe('TelegramBotApiHealthServiceProvider', () => {
  it('fails readiness when its required persistence capability is not wired', async () => {
    const service = createService(createTelegramBotApiHealthServiceProvider());

    await expect(service.checkReadiness()).resolves.toMatchObject({ data: { status: 'error' } });
  });

  it('reports required Mongo reachability and transaction topology when persistence is wired', async () => {
    const provider = createTelegramBotApiHealthServiceProvider();
    const service = createService(provider, mongoRuntime());
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

  it('fails readiness when the Mongo migration verifier reports an error', async () => {
    const service = createService(createTelegramBotApiHealthServiceProvider(), mongoRuntime('error'));
    const readiness = await service.checkReadiness();

    expect(readiness.data.status).toBe('error');
    expect(readiness.data.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'database-migrations', status: 'error', required: true }),
      ]),
    );
  });

  it('makes Redis a required readiness dependency when webhook replay storage is wired', async () => {
    const redisHealth = {
      name: 'redis',
      check: async () => ({ name: 'redis', status: 'error' as const }),
    } satisfies Pick<RedisHealthIndicator, 'check' | 'name'>;
    const provider = createTelegramBotApiHealthServiceProvider();

    const readiness = await createService(provider, mongoRuntime(), redisHealth).checkReadiness();

    expect(readiness.data.status).toBe('error');
    expect(readiness.data.checks?.find(({ name }) => name === 'redis')?.required).toBe(true);
    expect(injectionTokens(provider)).toEqual(
      expect.arrayContaining([DurableDatabaseRuntimeInjectToken, RedisHealthIndicator]),
    );
  });

  it('does not add a Redis dependency in polling mode composition', async () => {
    const readiness = await createService(createTelegramBotApiHealthServiceProvider(), mongoRuntime()).checkReadiness();

    expect(readiness.data.checks?.some(({ name }) => name === 'redis')).toBe(false);
  });

  it('normalizes Postgres indicators while preserving provider-specific names', async () => {
    const runtime: DurableDatabaseRuntime = {
      ...mongoRuntime(),
      provider: 'postgres',
      healthIndicators: [
        fakeIndicator('postgres', { reachable: true }),
        fakeIndicator('postgres-migrations', { pending: 0 }),
        fakeIndicator('postgres-replica', { reachable: true }),
      ],
    };
    const readiness = await createService(createTelegramBotApiHealthServiceProvider(), runtime).checkReadiness();

    expect(readiness.data.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'database', required: true }),
        expect.objectContaining({ name: 'database-migrations', required: false }),
        expect.objectContaining({ name: 'postgres-replica', required: false }),
      ]),
    );
  });
});
