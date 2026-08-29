import type { FactoryProvider, InjectionToken, OptionalFactoryDependency } from '@nestjs/common';
import { EnvHealthIndicator, HealthService, RuntimeHealthIndicator } from '@app/backend-common-health';
import { RedisHealthIndicator } from '@app/backend-common-redis';

export const TelegramBotApiHealthServiceProvider: FactoryProvider<HealthService> = {
  provide: HealthService,
  useFactory: (redisHealth?: RedisHealthIndicator) =>
    new HealthService({
      appName: 'telegram-bot-api',
      indicators: [
        new RuntimeHealthIndicator(),
        new EnvHealthIndicator({
          name: 'telegram-bot-config',
          required: true,
          requiredVariables: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_WEBHOOK_SECRET'],
          optionalVariables: ['TELEGRAM_BOT_MODE', 'TELEGRAM_BOT_WEBHOOK_URL', 'REDIS_URL'],
        }),
        ...(redisHealth ? [redisHealth] : []),
      ],
    }),
  inject: [optionalProvider(RedisHealthIndicator)],
};

export function createTelegramBotApiHealthServiceProvider(): FactoryProvider<HealthService> {
  return TelegramBotApiHealthServiceProvider;
}

function optionalProvider(token: InjectionToken): OptionalFactoryDependency {
  return { token, optional: true };
}
