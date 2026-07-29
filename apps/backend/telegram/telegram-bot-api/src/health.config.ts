import type { FactoryProvider, InjectionToken, OptionalFactoryDependency } from '@nestjs/common';
import { DurableDatabaseRuntimeInjectToken, type DurableDatabaseRuntime } from '@app/backend-common-bootstrap';
import {
  EnvHealthIndicator,
  HealthService,
  RuntimeHealthIndicator,
  type HealthIndicator,
} from '@app/backend-common-health';

export const TelegramBotApiHealthServiceProvider: FactoryProvider<HealthService> = {
  provide: HealthService,
  useFactory: (database?: DurableDatabaseRuntime) =>
    new HealthService({
      appName: 'telegram-bot-api',
      indicators: [
        new RuntimeHealthIndicator(),
        new EnvHealthIndicator({
          name: 'telegram-bot-config',
          required: true,
          requiredVariables: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_WEBHOOK_SECRET'],
          optionalVariables: [
            'AUTH_PERSISTENCE',
            'DATABASE_ENGINE',
            'TELEGRAM_BOT_MODE',
            'TELEGRAM_BOT_WEBHOOK_URL',
            'REDIS_URL',
          ],
        }),
        ...(database ? normalizeDatabaseIndicators(database) : [missingDatabaseIndicator()]),
      ],
    }),
  inject: [optionalProvider(DurableDatabaseRuntimeInjectToken)],
};

export function createTelegramBotApiHealthServiceProvider(): FactoryProvider<HealthService> {
  return TelegramBotApiHealthServiceProvider;
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
