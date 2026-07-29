import type { FactoryProvider, InjectionToken, OptionalFactoryDependency } from '@nestjs/common';
import { DurableDatabaseRuntimeInjectToken, type DurableDatabaseRuntime } from '@app/backend-common-bootstrap';
import {
  EnvHealthIndicator,
  HealthService,
  RuntimeHealthIndicator,
  type HealthIndicator,
} from '@app/backend-common-health';

export const DiscordAppApiHealthServiceProvider: FactoryProvider<HealthService> = {
  provide: HealthService,
  useFactory: (database?: DurableDatabaseRuntime) => {
    const memory =
      process.env.AUTH_PERSISTENCE === 'memory' || Boolean(process.env.VITEST && !process.env.AUTH_PERSISTENCE);
    return new HealthService({
      appName: 'discord-app-api',
      indicators: [
        new RuntimeHealthIndicator(),
        new EnvHealthIndicator({
          name: 'discord-bot-config',
          required: true,
          requiredVariables: ['DISCORD_APPLICATION_ID', 'DISCORD_PUBLIC_KEY'],
          optionalVariables: [
            'AUTH_PERSISTENCE',
            'DATABASE_ENGINE',
            'DISCORD_BOT_TOKEN',
            'DISCORD_COMMAND_REGISTRATION_ENABLED',
            'DISCORD_REGISTRATION_GUILD_ID',
            'DISCORD_WEB_APP_BASE_URL',
          ],
        }),
        ...databaseIndicators(database, memory),
      ],
    });
  },
  inject: [optionalProvider(DurableDatabaseRuntimeInjectToken)],
};

export function createDiscordAppApiHealthServiceProvider(): FactoryProvider<HealthService> {
  return DiscordAppApiHealthServiceProvider;
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
