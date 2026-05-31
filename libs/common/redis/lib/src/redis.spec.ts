import { describe, expect, it } from "vitest";
import { RedisConfigService } from "./config";
import { RedisMode } from "./const";
import { InMemoryRedisClient } from "./in-memory-redis.client";
import {
  RedisLockUnavailableError,
  RedisRedlockService,
} from "./redis-redlock.service";

describe("InMemoryRedisClient", () => {
  it("stores expiring values", async () => {
    const redis = new InMemoryRedisClient();
    await redis.setex("key", 60, "value");
    await expect(redis.get("key")).resolves.toBe("value");
  });

  it("supports hashes", async () => {
    const redis = new InMemoryRedisClient();
    await redis.hset("hash", "field", JSON.stringify({ ok: true }));
    await expect(redis.hgetall("hash")).resolves.toEqual({
      field: JSON.stringify({ ok: true }),
    });
  });

  it("supports Redis lock primitives", async () => {
    const redis = new InMemoryRedisClient();

    await expect(redis.set("lock", "one", "PX", 1000, "NX")).resolves.toBe(
      "OK",
    );
    await expect(
      redis.set("lock", "two", "PX", 1000, "NX"),
    ).resolves.toBeNull();
    await expect(redis.get("lock")).resolves.toBe("one");

    await expect(redis.extendIfValue("lock", "bad-token", 1000)).resolves.toBe(
      false,
    );
    await expect(redis.extendIfValue("lock", "one", 1000)).resolves.toBe(true);

    await expect(redis.deleteIfValue("lock", "bad-token")).resolves.toBe(false);
    await expect(redis.deleteIfValue("lock", "one")).resolves.toBe(true);
    await expect(redis.get("lock")).resolves.toBeNull();
  });
});

describe("RedisConfigService", () => {
  it("builds sentinel connection config", () => {
    const config = new RedisConfigService({
      mode: RedisMode.Sentinel,
      hosts: [
        {
          host: "redis-a",
          port: 26379,
        },
      ],
      sentinelGroupIdentifier: "mymaster",
      keyPrefix: "app:",
      lazyConnect: false,
    });

    expect(config.connectionConfig).toEqual({
      mode: RedisMode.Sentinel,
      url: undefined,
      hosts: [
        {
          host: "redis-a",
          port: 26379,
        },
      ],
      password: undefined,
      db: undefined,
      sentinelGroupIdentifier: "mymaster",
      keyPrefix: "app:",
      lazyConnect: false,
    });
  });
});

describe("RedisRedlockService", () => {
  it("acquires and releases a lock", async () => {
    const redis = new InMemoryRedisClient();
    const redlock = new RedisRedlockService(redis, redis);

    const lock = await redlock.acquire({
      resource: "job:1",
      ttlMs: 1000,
    });

    expect(lock).toMatchObject({
      resource: "job:1",
      key: "redlock:job:1",
      ttlMs: 1000,
    });
    if (!lock) {
      throw new Error("Expected lock to be acquired.");
    }

    await expect(
      redlock.acquire({
        resource: "job:1",
        ttlMs: 1000,
      }),
    ).resolves.toBeNull();

    await expect(redlock.release(lock)).resolves.toBe(true);
    await expect(
      redlock.acquire({
        resource: "job:1",
        ttlMs: 1000,
      }),
    ).resolves.not.toBeNull();
  });

  it("extends a lock only when the token still owns it", async () => {
    const redis = new InMemoryRedisClient();
    const redlock = new RedisRedlockService(redis, redis);
    const lock = await redlock.acquire({
      resource: "job:2",
      ttlMs: 1000,
    });
    if (!lock) {
      throw new Error("Expected lock to be acquired.");
    }

    const extended = await redlock.extend(lock, 2000);
    expect(extended).toMatchObject({
      resource: "job:2",
      key: "redlock:job:2",
      token: lock.token,
      ttlMs: 2000,
    });

    await redis.deleteIfValue(lock.key, lock.token);
    await expect(redlock.extend(lock, 2000)).resolves.toBeNull();
  });

  it("releases a lock after a using block", async () => {
    const redis = new InMemoryRedisClient();
    const redlock = new RedisRedlockService(redis, redis);

    await expect(
      redlock.using({
        resource: "job:3",
        ttlMs: 1000,
        action: () => "done",
      }),
    ).resolves.toBe("done");

    await expect(
      redlock.acquire({
        resource: "job:3",
        ttlMs: 1000,
      }),
    ).resolves.not.toBeNull();
  });

  it("throws when using cannot acquire a lock", async () => {
    const redis = new InMemoryRedisClient();
    const redlock = new RedisRedlockService(redis, redis);
    const lock = await redlock.acquire({
      resource: "job:4",
      ttlMs: 1000,
    });
    if (!lock) {
      throw new Error("Expected lock to be acquired.");
    }

    await expect(
      redlock.using({
        resource: "job:4",
        ttlMs: 1000,
        action: () => "never",
      }),
    ).rejects.toBeInstanceOf(RedisLockUnavailableError);

    await redlock.release(lock);
  });
});
