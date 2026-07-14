import { MemorySessionStorage, session, type StorageAdapter } from 'grammy';
import type { RedisClientLike } from '@app/backend-common-redis';
import type { TelegramBotContext, TelegramBotSession } from '../type';
import { RedisSessionStorage } from '../storage/redis-session-adapter';

export function initialTelegramBotSession(): TelegramBotSession {
  return {
    currentRoute: 'main',
    stack: ['main'],
    params: {},
    auth: { linked: false },
  };
}

export function createSessionMiddleware(storage: StorageAdapter<TelegramBotSession>) {
  return session<TelegramBotSession, TelegramBotContext>({
    initial: initialTelegramBotSession,
    storage,
    getSessionKey(ctx) {
      const fromId = ctx.from?.id;
      return fromId === undefined ? undefined : `telegram-bot:${fromId}`;
    },
  });
}

export function createTelegramSessionStorage(input: {
  redis?: RedisClientLike | null;
  ttlSeconds: number;
  fallback?: StorageAdapter<TelegramBotSession>;
}): StorageAdapter<TelegramBotSession> {
  if (!input.redis) {
    return input.fallback ?? new MemorySessionStorage<TelegramBotSession>();
  }

  // Uses native node-redis v6 through the shared RedisClientLike abstraction
  // instead of @grammyjs/storage-redis (which requires ioredis).
  return new RedisSessionStorage<TelegramBotSession>({
    redisClient: input.redis,
    ttlSeconds: input.ttlSeconds,
  });
}

export interface GrammyRatelimiterRedisClient {
  incr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
}

export function toRatelimiterRedisClient(
  redis: RedisClientLike | null | undefined,
): GrammyRatelimiterRedisClient | undefined {
  if (!redis) {
    return undefined;
  }

  return {
    incr: (key: string) => redis.incr(key),
    pexpire: async (key: string, milliseconds: number) => {
      await redis.expire(key, Math.max(1, Math.ceil(milliseconds / 1000)));
      return 1;
    },
  };
}
