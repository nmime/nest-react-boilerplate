import type { FactoryProvider, InjectionToken, OptionalFactoryDependency } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DurableDatabaseRuntimeInjectToken, type DurableDatabaseRuntime } from '@app/backend-common-bootstrap';
import type { HealthIndicator, HealthService } from '@app/backend-common-health';
import { createDiscordAppApiHealthServiceProvider } from './health.config';

type HealthFactory = (...dependencies: unknown[]) => HealthService;

const createService = (provider: FactoryProvider<HealthService>, ...dependencies: unknown[]) =>
  (provider.useFactory as HealthFactory)(...dependencies);

const fakeMongoIndicator = (name: string, details: Record<string, unknown> = {}) =>
  ({
    name,
    required: true,
    check: () => ({ name, status: 'ok' as const, required: true, details }),
  }) as HealthIndicator;

const mongoRuntime: DurableDatabaseRuntime = {
  provider: 'mongodb',
  healthIndicators: [
    fakeMongoIndicator('mongodb', { reachable: true }),
    fakeMongoIndicator('mongodb-transactions', { transactionCapable: true, topology: 'replica-set' }),
    fakeMongoIndicator('mongodb-migrations', { applied: true }),
  ],
  createSessionStore: () => {
    throw new Error('Session storage is not used by health tests.');
  },
};

const injectionTokens = (provider: FactoryProvider<HealthService>): InjectionToken[] =>
  (provider.inject ?? []).map((dependency) =>
    typeof dependency === 'object' && 'token' in dependency
      ? (dependency as OptionalFactoryDependency).token
      : (dependency as InjectionToken),
  );

describe('DiscordAppApiHealthServiceProvider', () => {
  it('identifies the app and requires the public interaction configuration', async () => {
    const service = createService(createDiscordAppApiHealthServiceProvider());
    const previousApplicationId = process.env.DISCORD_APPLICATION_ID;
    const previousPublicKey = process.env.DISCORD_PUBLIC_KEY;

    delete process.env.DISCORD_APPLICATION_ID;
    delete process.env.DISCORD_PUBLIC_KEY;
    try {
      expect(service.appName).toBe('discord-app-api');
      const readiness = await service.checkReadiness();
      expect(readiness.data.status).toBe('error');
      expect(readiness.data.checks?.find(({ name }) => name === 'discord-bot-config')?.required).toBe(true);
    } finally {
      restoreEnv('DISCORD_APPLICATION_ID', previousApplicationId);
      restoreEnv('DISCORD_PUBLIC_KEY', previousPublicKey);
    }
  });

  it('reports required Mongo transaction readiness and does not inject Postgres', async () => {
    const provider = createDiscordAppApiHealthServiceProvider();
    const service = createService(provider, mongoRuntime);
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

  it('keeps memory test mode free of database injections and checks', async () => {
    const provider = createDiscordAppApiHealthServiceProvider();
    const service = createService(provider);

    expect(injectionTokens(provider)).toContain(DurableDatabaseRuntimeInjectToken);
    expect((await service.check()).checks.some(({ name }) => name.startsWith('database'))).toBe(false);
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
