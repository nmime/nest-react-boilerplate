import { Global, Module, type DynamicModule, type FactoryProvider } from '@nestjs/common';
import { RedisInjectToken, type RedisClientLike } from '@app/backend-common-redis';
import { TelegramBotInstanceInjectToken } from '../const';
import { createTelegramBot } from './bot';
import { resolveTelegramBotConfig } from './config';
import { createTelegramSessionStorage, toRatelimiterRedisClient } from './session';
import type { TelegramBotInstance, TelegramBotAuthPort } from '../type';

export interface TelegramBotModuleOptions {
  imports?: NonNullable<DynamicModule['imports']>;
  useRedis?: boolean;
  auth?: TelegramBotAuthPort;
}

@Global()
@Module({})
export class TelegramBotModule {
  static register(options: TelegramBotModuleOptions = {}): DynamicModule {
    const useRedis = options.useRedis ?? false;
    return {
      module: TelegramBotModule,
      imports: options.imports ?? [],
      providers: [createTelegramBotProvider(useRedis, options.auth)],
      exports: [TelegramBotInstanceInjectToken],
    };
  }
}

function createTelegramBotProvider(
  useRedis: boolean,
  auth?: TelegramBotAuthPort,
): FactoryProvider<TelegramBotInstance> {
  return {
    provide: TelegramBotInstanceInjectToken,
    useFactory: (redis?: RedisClientLike) => {
      const config = resolveTelegramBotConfig();
      return createTelegramBot(config, {
        ...(auth ? { auth } : {}),
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
