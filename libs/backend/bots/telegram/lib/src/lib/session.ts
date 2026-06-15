import { MemorySessionStorage, session, type StorageAdapter } from "grammy";
import { RedisAdapter } from "@grammyjs/storage-redis";
import type { RedisClientLike } from "@app/common/redis";
import type { TelegramBotContext, TelegramBotSession } from "./types";

export function initialTelegramBotSession(): TelegramBotSession {
  return {
    currentRoute: "main",
    stack: ["main"],
    params: {},
    auth: { linked: false },
  };
}

export function createSessionMiddleware(
  storage: StorageAdapter<TelegramBotSession>,
) {
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

  // @grammyjs/i18n expects Fluent files and would duplicate the repo root JSON
  // catalogs. The bot instead exposes ctx.t through @app/common/i18n and uses
  // @grammyjs/storage-redis only for shared production sessions when Redis is
  // configured, with memory storage as local/test fallback.
  return new RedisAdapter<TelegramBotSession>({
    instance: input.redis,
    ttl: input.ttlSeconds,
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
