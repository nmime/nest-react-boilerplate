import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { InjectRedis, InjectTransientRedis } from "./decorator";
import { RedisLockUnavailableError } from "./exception";
import type {
  RedisClientLike,
  RedisLock,
  RedisLockAcquireOptions,
  RedisLockUsingOptions,
} from "./type";
import {
  assertValidTtl,
  countSuccesses,
  getLockKey,
  getQuorum,
  getRetryDelay,
  getValidityMs,
  isLockAcquired,
  sleep,
} from "./util";

@Injectable()
export class RedisRedlockService {
  constructor(
    @InjectRedis() private readonly redis: RedisClientLike,
    @InjectTransientRedis() private readonly transientRedis: RedisClientLike,
  ) {}

  async acquire(options: RedisLockAcquireOptions): Promise<RedisLock | null> {
    assertValidTtl(options.ttlMs);

    const retryCount = options.retryCount ?? 0;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop -- retries are sequential by design: attempt, then back off, then retry.
      const lock = await this.tryAcquire(options);
      if (lock) {
        return lock;
      }

      if (attempt < retryCount) {
        // eslint-disable-next-line no-await-in-loop -- the retry backoff must elapse before the next attempt.
        await sleep(getRetryDelay(options));
      }
    }

    return null;
  }

  async release(lock: RedisLock): Promise<boolean> {
    const clients = this.getClients();
    const results = await Promise.allSettled(
      clients.map((client) => client.deleteIfValue(lock.key, lock.token)),
    );

    return countSuccesses(results) >= getQuorum(clients.length);
  }

  async extend(lock: RedisLock, ttlMs: number): Promise<RedisLock | null> {
    assertValidTtl(ttlMs);

    const clients = this.getClients();
    const startedAt = Date.now();
    const results = await Promise.allSettled(
      clients.map((client) =>
        client.extendIfValue(lock.key, lock.token, ttlMs),
      ),
    );
    const validityMs = getValidityMs(startedAt, ttlMs, 0.01);

    if (
      countSuccesses(results) >= getQuorum(clients.length) &&
      validityMs > 0
    ) {
      return {
        ...lock,
        ttlMs,
        expiresAt: Date.now() + validityMs,
      };
    }

    await this.release(lock);
    return null;
  }

  async using<T>(options: RedisLockUsingOptions<T>): Promise<T> {
    const lock = await this.acquire(options);
    if (!lock) {
      throw new RedisLockUnavailableError(options.resource);
    }

    try {
      return await options.action(lock);
    } finally {
      await this.release(lock);
    }
  }

  private async tryAcquire(
    options: RedisLockAcquireOptions,
  ): Promise<RedisLock | null> {
    const clients = this.getClients();
    const startedAt = Date.now();
    const token = randomUUID();
    const key = getLockKey(options.resource);
    const acquiredClients: RedisClientLike[] = [];

    for (const client of clients) {
      try {
        // eslint-disable-next-line no-await-in-loop -- Redlock acquires nodes sequentially so total elapsed time bounds the lock validity window.
        const result = await client.set(key, token, "PX", options.ttlMs, "NX");
        if (isLockAcquired(result)) {
          acquiredClients.push(client);
        }
      } catch {
        // Redlock can still succeed when a quorum of independent clients accepts.
      }
    }

    const validityMs = getValidityMs(
      startedAt,
      options.ttlMs,
      options.driftFactor ?? 0.01,
    );

    if (acquiredClients.length >= getQuorum(clients.length) && validityMs > 0) {
      return {
        resource: options.resource,
        key,
        token,
        ttlMs: options.ttlMs,
        expiresAt: Date.now() + validityMs,
      };
    }

    await Promise.allSettled(
      acquiredClients.map((client) => client.deleteIfValue(key, token)),
    );

    return null;
  }

  private getClients(): RedisClientLike[] {
    // Collapse clients that point at the same server (identical connectionId)
    // so quorum is computed over unique Redis nodes. Default wiring injects two
    // distinct adapters for the same server; without this a quorum of 2 could
    // never be reached (SET NX succeeds on only one of them) and acquire() would
    // always fail. Clients without a connectionId fall back to object identity.
    const seen = new Set<unknown>();
    const clients: RedisClientLike[] = [];
    for (const client of [this.redis, this.transientRedis]) {
      const identity = client.connectionId ?? client;
      if (seen.has(identity)) {
        continue;
      }
      seen.add(identity);
      clients.push(client);
    }
    return clients;
  }
}
