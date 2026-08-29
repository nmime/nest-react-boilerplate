import { Global, Module, type DynamicModule, type FactoryProvider } from '@nestjs/common';
import { RedisInjectToken, type RedisClientLike } from '@app/backend-common-redis';
import { TelegramBotInstanceInjectToken } from '../const';
import { createTelegramBot } from './bot';
import { resolveTelegramBotConfig } from './config';
import { createTelegramSessionStorage, toRatelimiterRedisClient } from './session';
import type { TelegramBotInstance } from '../type';

export interface TelegramBotModuleOptions {
  imports?: NonNullable<DynamicModule['imports']>;
  useRedis?: boolean;
}

@Global()
@Module({})
export class TelegramBotModule {
  static register(options: TelegramBotModuleOptions = {}): DynamicModule {
    const useRedis = options.useRedis ?? false;
    return {
      module: TelegramBotModule,
      imports: options.imports ?? [],
      providers: [createTelegramBotProvider(useRedis)],
      exports: [TelegramBotInstanceInjectToken],
    };
  }
}

function createTelegramBotProvider(useRedis: boolean): FactoryProvider<TelegramBotInstance> {
  return {
    provide: TelegramBotInstanceInjectToken,
    useFactory: (redis?: RedisClientLike) => {
      const config = resolveTelegramBotConfig();
      return createTelegramBot(config, {
        ...(redis
          ? {
              sessionStorage: createTelegramSessionStorage({
                redis,
                ttlSeconds: config.sessionTtlSeconds,
              }),
              rateLimitStorage: toRatelimiterRedisClient(redis),
            }
          : {}),
      });
    },
    inject: useRedis ? [RedisInjectToken] : [],
  };
}
