import { Inject, Module } from "@nestjs/common";
import type {
  DynamicModule,
  OnApplicationShutdown,
  Provider,
} from "@nestjs/common";
import { RedisConfigService } from "./config";
import { RedisInjectToken, RedisTransientInjectToken } from "./const";
import { InMemoryRedisClient } from "./in-memory-redis.client";
import { closeRedisClient, createRedisClient } from "./redis-client.factory";
import { RedisCacheService } from "./redis-cache.service";
import { RedisHealthIndicator } from "./redis.health";
import {
  RedisRateLimitService,
  SHARED_RATE_LIMITER,
} from "./redis-rate-limit.service";
import { RedisRedlockService } from "./redis-redlock.service";
import type { RedisClientLike, RedisConfig } from "./type";

export type RedisModuleOptions = RedisConfig;

class RedisShutdownService implements OnApplicationShutdown {
  constructor(
    @Inject(RedisInjectToken) private readonly redis: RedisClientLike,
    @Inject(RedisTransientInjectToken)
    private readonly transientRedis: RedisClientLike,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [...new Set([this.redis, this.transientRedis])].map((client) =>
        closeRedisClient(client),
      ),
    );
  }
}

@Module({})
export class RedisModule {
  static forRoot(options: RedisModuleOptions = {}): DynamicModule {
    const fallbackClient = new InMemoryRedisClient();
    const providers: Provider[] = [
      {
        provide: RedisConfigService,
        useValue: new RedisConfigService(options),
      },
      {
        provide: RedisInjectToken,
        useFactory: (configService: RedisConfigService) =>
          options.client ?? createClient(configService, fallbackClient),
        inject: [RedisConfigService],
      },
      {
        provide: RedisTransientInjectToken,
        useFactory: (configService: RedisConfigService) =>
          options.transientClient ??
          options.client ??
          createClient(configService, fallbackClient),
        inject: [RedisConfigService],
      },
      RedisShutdownService,
      RedisHealthIndicator,
      RedisCacheService,
      RedisRateLimitService,
      { provide: SHARED_RATE_LIMITER, useExisting: RedisRateLimitService },
      RedisRedlockService,
    ];

    return {
      module: RedisModule,
      providers,
      exports: providers,
    };
  }
}

function createClient(
  configService: RedisConfigService,
  fallbackClient: RedisClientLike,
): RedisClientLike {
  const config = configService.connectionConfig;
  return config ? createRedisClient(config) : fallbackClient;
}
