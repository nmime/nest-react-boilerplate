/* eslint-disable @typescript-eslint/unbound-method -- asserting on vitest mock fns exposed as typed client methods, not invoking unbound methods */
import { describe, expect, it, vi } from "vitest";
import { InMemoryRedisClient } from "./in-memory-redis.client";
import { RedisRedlockService } from "./redis-redlock.service";
import type { RedisClientLike } from "./type";
import { getRetryDelay } from "./util";

describe("getRetryDelay", () => {
  it("uses provided delay and jitter bounds", () => {
    const delay = getRetryDelay({
      resource: "job",
      ttlMs: 1000,
      retryDelayMs: 200,
      retryJitterMs: 0,
    });
    expect(delay).toBe(200);
  });

  it("defaults to a 100ms delay plus up to 50ms of jitter", () => {
    const delay = getRetryDelay({ resource: "job", ttlMs: 1000 });
    expect(delay).toBeGreaterThanOrEqual(100);
    expect(delay).toBeLessThanOrEqual(150);
  });
});

function neverAcquiringClient(): RedisClientLike {
  const base = new InMemoryRedisClient();
  return {
    ...base,
    connectionId: "node-a",
    set: vi.fn(() => Promise.resolve(null)),
    deleteIfValue: vi.fn(() => Promise.resolve(false)),
    ping: base.ping.bind(base),
    get: base.get.bind(base),
    pipeline: base.pipeline.bind(base),
  } as unknown as RedisClientLike;
}

describe("RedisRedlockService edge cases", () => {
  it("rejects a non-positive lock ttl before contacting Redis", async () => {
    const redis = new InMemoryRedisClient();
    const redlock = new RedisRedlockService(redis, redis);

    await expect(
      redlock.acquire({ resource: "job", ttlMs: 0 }),
    ).rejects.toThrow("Redis lock ttlMs must be a positive integer: 0");
  });

  it("retries with backoff and gives up when a quorum never accepts", async () => {
    const client = neverAcquiringClient();
    const redlock = new RedisRedlockService(client, client);

    await expect(
      redlock.acquire({
        resource: "job",
        ttlMs: 1000,
        retryCount: 2,
        retryDelayMs: 0,
        retryJitterMs: 0,
      }),
    ).resolves.toBeNull();
    // One SET attempt per try (1 initial + 2 retries).
    expect(client.set).toHaveBeenCalledTimes(3);
  });

  it("releases partially acquired locks when the validity window collapses", async () => {
    const redis = new InMemoryRedisClient();
    const deleteSpy = vi.spyOn(redis, "deleteIfValue");
    const redlock = new RedisRedlockService(redis, redis);

    // ttlMs of 1 leaves no validity window after clock drift, so the lock is
    // acquired on the node and then rolled back.
    await expect(
      redlock.acquire({ resource: "job", ttlMs: 1 }),
    ).resolves.toBeNull();
    expect(deleteSpy).toHaveBeenCalled();
    await expect(redis.get("redlock:job")).resolves.toBeNull();
  });
});
