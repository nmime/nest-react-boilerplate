import { describe, expect, it, vi } from "vitest";
import {
  createSessionMiddleware,
  createTelegramSessionStorage,
  initialTelegramBotSession,
  toRatelimiterRedisClient,
} from "./session";
import type { TelegramBotSession } from "./types";

describe("Telegram bot sessions", () => {
  it("creates an isolated public main-menu session", () => {
    expect(initialTelegramBotSession()).toEqual({
      currentRoute: "main",
      stack: ["main"],
      params: {},
      auth: { linked: false },
    });
    expect(initialTelegramBotSession()).not.toBe(initialTelegramBotSession());
  });

  it("uses memory fallback storage when Redis is unavailable", () => {
    const fallback = {
      read: vi.fn(),
      write: vi.fn(),
      delete: vi.fn(),
    };

    expect(
      createTelegramSessionStorage({ ttlSeconds: 60, fallback, redis: null }),
    ).toBe(fallback);
    expect(createTelegramSessionStorage({ ttlSeconds: 60 })).toBeDefined();
  });

  it("selects the Redis adapter when a Redis client is configured", () => {
    const redis = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      expire: vi.fn(),
    };
    const fallback = {
      read: vi.fn(),
      write: vi.fn(),
      delete: vi.fn(),
    };

    expect(
      createTelegramSessionStorage({
        ttlSeconds: 60,
        redis: redis as never,
        fallback,
      }),
    ).not.toBe(fallback);
  });

  it("uses Telegram sender id as the only session key source", async () => {
    const stored = new Map<string, TelegramBotSession>();
    const middleware = createSessionMiddleware({
      read: vi.fn((key: string) => Promise.resolve(stored.get(key))),
      write: vi.fn((key: string, value: TelegramBotSession) => {
        stored.set(key, value);
        return Promise.resolve();
      }),
      delete: vi.fn(),
    });
    const ctx = { from: { id: 123 }, chat: { id: 999 } } as never;

    await middleware(ctx, () => Promise.resolve());

    expect([...stored.keys()]).toEqual(["telegram-bot:123"]);
  });

  it("adapts Redis counters for rate limiter windows without network access", async () => {
    const redis = {
      incr: vi.fn(() => Promise.resolve(2)),
      expire: vi.fn(() => Promise.resolve(true)),
    };
    const client = toRatelimiterRedisClient(redis);

    await expect(client?.incr("telegram-bot-rate-limit:1")).resolves.toBe(2);
    await expect(
      client?.pexpire("telegram-bot-rate-limit:1", 1500),
    ).resolves.toBe(1);
    await expect(client?.pexpire("telegram-bot-rate-limit:1", 1)).resolves.toBe(
      1,
    );

    expect(redis.expire).toHaveBeenNthCalledWith(
      1,
      "telegram-bot-rate-limit:1",
      2,
    );
    expect(redis.expire).toHaveBeenNthCalledWith(
      2,
      "telegram-bot-rate-limit:1",
      1,
    );
    expect(toRatelimiterRedisClient(null)).toBeUndefined();
  });
});
