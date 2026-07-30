import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FactoryProvider, InjectionToken, OptionalFactoryDependency } from '@nestjs/common';
import { DurableDatabaseRuntimeInjectToken, type DurableDatabaseRuntime } from '@app/backend-common-bootstrap';
import {
  EnvHealthIndicator,
  HealthService,
  I18nAssetsHealthIndicator,
  RuntimeHealthIndicator,
  type HealthIndicator,
  type HealthIndicatorResult,
} from '@app/backend-common-health';
import { supportedLocales } from '@app/backend-common-i18n';
import { NatsHealthIndicator } from '@app/backend-common-nats';
import { RedisHealthIndicator } from '@app/backend-common-redis';

export const AuthAppHealthServiceProvider: FactoryProvider<HealthService> = {
  provide: HealthService,
  useFactory: (
    database?: DurableDatabaseRuntime,
    redisHealth?: RedisHealthIndicator,
    natsHealth?: NatsHealthIndicator,
  ) => {
    const memory =
      process.env.AUTH_PERSISTENCE === 'memory' || Boolean(process.env.VITEST && !process.env.AUTH_PERSISTENCE);
    return new HealthService({
      appName: 'auth-app-api',
      indicators: [
        new RuntimeHealthIndicator(),
        new EnvHealthIndicator({
          name: 'config',
          required: false,
          optionalVariables: ['AUTH_PERSISTENCE', 'DATABASE_ENGINE', 'SESSION_SECRET', 'REDIS_URL', 'NATS_SERVERS'],
        }),
        new I18nAssetsHealthIndicator({ rootPath: resolveI18nRootPath(), locales: supportedLocales, required: false }),
        authPersistenceIndicator(database?.provider ?? (memory ? 'memory' : 'unconfigured')),
        ...databaseIndicators(database, memory),
        redisHealth ? withRequired(redisHealth, false) : skippedIndicator('redis'),
        natsHealth ? withRequired(natsHealth, false) : skippedIndicator('nats'),
      ],
    });
  },
  inject: [
    optionalProvider(DurableDatabaseRuntimeInjectToken),
    optionalProvider(RedisHealthIndicator),
    optionalProvider(NatsHealthIndicator),
  ],
};

export function createAuthAppHealthServiceProvider(): FactoryProvider<HealthService> {
  return AuthAppHealthServiceProvider;
}
function databaseIndicators(runtime: DurableDatabaseRuntime | undefined, memory: boolean): HealthIndicator[] {
  if (runtime) {
    return normalizeDatabaseIndicators(runtime);
  }
  return memory ? [] : [missingDatabaseIndicator()];
}
function normalizeDatabaseIndicators(runtime: DurableDatabaseRuntime): HealthIndicator[] {
  const names =
    runtime.provider === 'mongodb'
      ? ['database', 'database-transactions', 'database-migrations']
      : ['database', 'database-migrations'];
  return runtime.healthIndicators.map((indicator, index) =>
    withRequired(indicator, index === 0 || runtime.provider === 'mongodb', names[index] ?? indicator.name),
  );
}
function authPersistenceIndicator(mode: string): HealthIndicator {
  return {
    name: 'auth-persistence',
    required: true,
    check: () => ({
      name: 'auth-persistence',
      status: 'ok',
      required: true,
      details: { mode, databaseRequired: mode !== 'memory' },
    }),
  };
}
function resolveI18nRootPath(): string | undefined {
  return [join(process.cwd(), 'i18n'), join(process.cwd(), '../../../i18n')].find(existsSync);
}
function missingDatabaseIndicator(): HealthIndicator {
  return {
    name: 'database',
    required: true,
    check: () => ({
      name: 'database',
      status: 'error',
      required: true,
      details: { message: 'Selected database provider is not configured.' },
    }),
  };
}
function skippedIndicator(name: string): HealthIndicator {
  return {
    name,
    required: false,
    check: (): HealthIndicatorResult => ({
      name,
      status: 'ok',
      required: false,
      details: { enabled: false, skipped: true, reason: 'not_configured' },
    }),
  };
}
function withRequired(indicator: HealthIndicator, required: boolean, name = indicator.name): HealthIndicator {
  return {
    name,
    required,
    async check(context) {
      return { ...(await indicator.check(context)), name, required };
    },
  };
}
function optionalProvider(token: InjectionToken): OptionalFactoryDependency {
  return { token, optional: true };
}
