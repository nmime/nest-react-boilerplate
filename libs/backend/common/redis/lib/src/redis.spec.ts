import { describe, expect, it, vi } from "vitest";
import { RedisConfigService } from "./config";
import { RedisMode } from "./const";
import { RedisClientAdapter } from "./redis-client.factory";
import { InMemoryRedisClient } from "./in-memory-redis.client";
import {
  RedisLockUnavailableError,
  RedisRedlockService,
} from "./redis-redlock.service";
import { RedisHealthIndicator } from "./redis.health";
import {
  buildRateLimitKey,
  RedisRateLimitService,
} from "./redis-rate-limit.service";

describe("RedisClientAdapter", () => {
  function nativeRedisClient(commands: string[][]) {
    return {
      isOpen: true,
      connect: vi.fn(() => Promise.resolve(undefined)),
      close: vi.fn(() => Promise.resolve(undefined)),
      destroy: vi.fn(() => Promise.resolve(undefined)),
      ping: vi.fn(() => Promise.resolve("PONG")),
      get: vi.fn(() => Promise.resolve(null)),
      set: vi.fn(() => Promise.resolve("OK")),
      setEx: vi.fn(() => Promise.resolve("OK")),
      mGet: vi.fn(() => Promise.resolve([])),
      del: vi.fn(() => Promise.resolve(0)),
      incr: vi.fn(() => Promise.resolve(1)),
      expire: vi.fn(() => Promise.resolve(1)),
      hSet: vi.fn(() => Promise.resolve(1)),
      hGetAll: vi.fn(() => Promise.resolve({})),
      hDel: vi.fn(() => Promise.resolve(1)),
      sendCommand: vi.fn((command: string[]) => {
        commands.push(command);
        return Promise.resolve(1);
      }),
      on: vi.fn(),
    };
  }

  it("executes only fixed Redis Lua scripts for lock ownership operations", async () => {
    const commands: string[][] = [];
    const redis = new RedisClientAdapter(nativeRedisClient(commands), {
      keyPrefix: "app:",
    });

    await expect(redis.deleteIfValue("lock", "token")).resolves.toBe(true);
    await expect(redis.extendIfValue("lock", "token", 1000)).resolves.toBe(
      true,
    );

    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual([
      "EVAL",
      expect.stringContaining('redis.call("del", KEYS[1])'),
      "1",
      "app:lock",
      "token",
    ]);
    expect(commands[1]).toEqual([
      "EVAL",
      expect.stringContaining('redis.call("pexpire", KEYS[1], ARGV[2])'),
      "1",
      "app:lock",
      "token",
      "1000",
    ]);
  });
});

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

describe("RedisHealthIndicator", () => {
  it("checks Redis health with ping", async () => {
    const redis = new InMemoryRedisClient();
    const health = new RedisHealthIndicator(redis);

    await expect(health.check()).resolves.toEqual({
      name: "redis",
      status: "ok",
    });
  });

  it("redacts connection URLs and secret-like fields from Redis health errors", async () => {
    const unsafeMessage = [
      "connect",
      credentialUrl("redis", "user", "super-secret", "redis:6379/0"),
      secretPair("password", "super-secret"),
      secretPair("token", "abc"),
    ].join(" ");
    const redis = {
      ...new InMemoryRedisClient(),
      ping: vi.fn(() => Promise.reject(new Error(unsafeMessage))),
    };
    const health = new RedisHealthIndicator(redis);

    await expect(health.check()).resolves.toEqual({
      name: "redis",
      status: "error",
      details: {
        message: [
          "connect",
          redactedUrl("redis", "redis:6379/0"),
          redactedPair("password"),
          redactedPair("token"),
        ].join(" "),
        type: "Error",
      },
    });
  });
});

function credentialUrl(
  protocol: string,
  username: string,
  password: string,
  hostAndPath: string,
): string {
  return `${protocol}://${username}:${password}@${hostAndPath}`;
}

function redactedUrl(protocol: string, hostAndPath: string): string {
  return `${protocol}://[redacted]@${hostAndPath}`;
}

function secretPair(key: string, value: string): string {
  return `${key}=${value}`;
}

function redactedPair(key: string): string {
  return `${key}=[redacted]`;
}

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

describe("RedisRateLimitService", () => {
  it("builds tenant-aware shared rate-limit keys and counts hits", async () => {
    const redis = new InMemoryRedisClient();
    const limiter = new RedisRateLimitService(redis);
    const key = buildRateLimitKey({
      scope: "auth",
      tenantId: "11111111-1111-4111-8111-111111111111",
      subject: "User@Example.com",
      action: "login",
    });

    expect(key).toBe(
      "rate-limit:auth:11111111-1111-4111-8111-111111111111:user_example.com:login",
    );
    await expect(
      limiter.hit({ key, windowSeconds: 60, limit: 1 }),
    ).resolves.toEqual({
      allowed: true,
      count: 1,
      remaining: 0,
    });
    await expect(
      limiter.hit({ key, windowSeconds: 60, limit: 1 }),
    ).resolves.toMatchObject({
      allowed: false,
      count: 2,
      remaining: 0,
    });
  });
});
