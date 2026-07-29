import type { FactoryProvider, InjectionToken, OptionalFactoryDependency } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DurableDatabaseRuntimeInjectToken, type DurableDatabaseRuntime } from '@app/backend-common-bootstrap';
import type { HealthIndicator, HealthService } from '@app/backend-common-health';
import { createTelegramBotApiHealthServiceProvider } from './health.config';

type HealthFactory = (...dependencies: unknown[]) => HealthService;

const createService = (provider: FactoryProvider<HealthService>, ...dependencies: unknown[]) =>
  (provider.useFactory as HealthFactory)(...dependencies);

const fakeMongoIndicator = (name: string, details: Record<string, unknown> = {}) =>
  ({
    name,
    required: true,
    check: () => ({ name, status: 'ok' as const, required: true, details }),
  }) as HealthIndicator;

const mongoRuntime = (migrationStatus: 'error' | 'ok' = 'ok'): DurableDatabaseRuntime => ({
  provider: 'mongodb',
  healthIndicators: [
    fakeMongoIndicator('mongodb', { reachable: true }),
    fakeMongoIndicator('mongodb-transactions', { transactionCapable: true, topology: 'replica-set' }),
    {
      ...fakeMongoIndicator('mongodb-migrations', { applied: migrationStatus === 'ok' }),
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
});
