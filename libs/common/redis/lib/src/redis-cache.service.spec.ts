import { describe, expect, it, vi } from "vitest";
import { InMemoryRedisClient } from "./in-memory-redis.client";
import { RedisCacheService } from "./redis-cache.service";

describe("RedisCacheService", () => {
  it("returns cached values without rerunning the action", async () => {
    const cache = new RedisCacheService(new InMemoryRedisClient());
    const action = vi.fn(() => Promise.resolve({ ok: true }));

    await expect(
      cache.withCache({ key: "cache:hit", ttl: 60, action }),
    ).resolves.toEqual({ ok: true });
    await expect(
      cache.withCache({ key: "cache:hit", ttl: 60, action }),
    ).resolves.toEqual({ ok: true });

    expect(action).toHaveBeenCalledOnce();
  });

  it("expires cached values using the public ttl seconds contract", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const cache = new RedisCacheService(new InMemoryRedisClient());
      const action = vi
        .fn<() => Promise<number>>()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2);

      await expect(
        cache.withCache({ key: "cache:ttl", ttl: 1, action }),
      ).resolves.toBe(1);
      vi.advanceTimersByTime(999);
      await expect(
        cache.withCache({ key: "cache:ttl", ttl: 1, action }),
      ).resolves.toBe(1);
      vi.advanceTimersByTime(1);
      await expect(
        cache.withCache({ key: "cache:ttl", ttl: 1, action }),
      ).resolves.toBe(2);

      expect(action).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("deduplicates concurrent misses for the same key", async () => {
    const cache = new RedisCacheService(new InMemoryRedisClient());
    const action = vi.fn(
      async () =>
        await new Promise((resolve) => {
          setTimeout(() => resolve("value"), 5);
        }),
    );

    await expect(
      Promise.all([
        cache.withCache({ key: "cache:inflight", ttl: 60, action }),
        cache.withCache({ key: "cache:inflight", ttl: 60, action }),
      ]),
    ).resolves.toEqual(["value", "value"]);
    expect(action).toHaveBeenCalledOnce();
  });

  it("does not cache null, undefined, or skipped values", async () => {
    const cache = new RedisCacheService(new InMemoryRedisClient());
    const nullAction = vi.fn(() => Promise.resolve(null as string | null));
    const skippedAction = vi.fn(() => Promise.resolve("skip-me"));

    await cache.withCache({ key: "cache:null", ttl: 60, action: nullAction });
    await cache.withCache({ key: "cache:null", ttl: 60, action: nullAction });
    await cache.withCache({
      key: "cache:skip",
      ttl: 60,
      action: skippedAction,
      skip: (value) => value === "skip-me",
    });
    await cache.withCache({
      key: "cache:skip",
      ttl: 60,
      action: skippedAction,
      skip: (value) => value === "skip-me",
    });

    expect(nullAction).toHaveBeenCalledTimes(2);
    expect(skippedAction).toHaveBeenCalledTimes(2);
  });

  it("supports custom serialization and invalidation", async () => {
    const cache = new RedisCacheService(new InMemoryRedisClient());
    const action = vi
      .fn<() => Promise<Date>>()
      .mockResolvedValueOnce(new Date("2026-01-02T03:04:05Z"))
      .mockResolvedValueOnce(new Date("2026-02-03T04:05:06Z"));
    const params = {
      key: "cache:custom",
      ttl: 60,
      action,
      serialize: (value: Date) => value.toISOString(),
      deserialize: (raw: string) => new Date(raw),
    };

    await expect(cache.withCache(params)).resolves.toEqual(
      new Date("2026-01-02T03:04:05Z"),
    );
    await expect(cache.withCache(params)).resolves.toEqual(
      new Date("2026-01-02T03:04:05Z"),
    );
    await cache.invalidateCache({ key: "cache:custom" });
    await expect(cache.withCache(params)).resolves.toEqual(
      new Date("2026-02-03T04:05:06Z"),
    );

    expect(action).toHaveBeenCalledTimes(2);
  });

  it("fetches and stores only missing batch values", async () => {
    const cache = new RedisCacheService(new InMemoryRedisClient());
    const fetchMissing = vi.fn((keys: string[]) =>
      Promise.resolve(new Map(keys.map((key) => [key, key.toUpperCase()]))),
    );

    await expect(
      cache.withCacheBatch({
        keys: ["one", "two", "one"],
        ttl: 60,
        fetchMissing,
      }),
    ).resolves.toEqual(
      new Map([
        ["one", "ONE"],
        ["two", "TWO"],
      ]),
    );

    await expect(
      cache.withCacheBatch({
        keys: ["two", "three"],
        ttl: 60,
        fetchMissing,
      }),
    ).resolves.toEqual(
      new Map([
        ["two", "TWO"],
        ["three", "THREE"],
      ]),
    );

    expect(fetchMissing).toHaveBeenNthCalledWith(1, ["one", "two"]);
    expect(fetchMissing).toHaveBeenNthCalledWith(2, ["three"]);
  });

  it("propagates Redis read and write errors", async () => {
    const readError = new Error("redis read failed");
    const writeError = new Error("redis write failed");
    const readFailingRedis = new InMemoryRedisClient();
    const writeFailingRedis = new InMemoryRedisClient();
    vi.spyOn(readFailingRedis, "get").mockRejectedValue(readError);
    vi.spyOn(writeFailingRedis, "set").mockRejectedValue(writeError);

    await expect(
      new RedisCacheService(readFailingRedis).withCache({
        key: "cache:error:read",
        ttl: 60,
        action: () => Promise.resolve("value"),
      }),
    ).rejects.toThrow(readError);

    await expect(
      new RedisCacheService(writeFailingRedis).withCache({
        key: "cache:error:write",
        ttl: 60,
        action: () => Promise.resolve("value"),
      }),
    ).rejects.toThrow(writeError);
  });

  it("keeps hash helpers compatible for existing consumers", async () => {
    const redis = new InMemoryRedisClient();
    const cache = new RedisCacheService(redis);

    await cache.setHash(
      "hash:cache",
      { one: { value: 1 }, two: { value: 2 } },
      60,
    );
    await expect(cache.getHash("hash:cache")).resolves.toEqual({
      one: { value: 1 },
      two: { value: 2 },
    });
    await cache.deleteFromHash("hash:cache", "one");
    await expect(cache.getHash("hash:cache")).resolves.toEqual({
      two: { value: 2 },
    });
  });
});
