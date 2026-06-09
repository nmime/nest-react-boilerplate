import { randomInt, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { InjectRedis, InjectTransientRedis } from "./decorator";
import type { RedisClientLike } from "./type";

export interface RedisLock {
  resource: string;
  key: string;
  token: string;
  ttlMs: number;
  expiresAt: number;
}

export interface RedisLockAcquireOptions {
  resource: string;
  ttlMs: number;
  retryCount?: number;
  retryDelayMs?: number;
  retryJitterMs?: number;
  driftFactor?: number;
}

export interface RedisLockUsingOptions<T> extends RedisLockAcquireOptions {
  action: (lock: RedisLock) => T | Promise<T>;
}

export class RedisLockUnavailableError extends Error {
  constructor(resource: string) {
    super(`Unable to acquire Redis lock for resource: ${resource}`);
    this.name = "RedisLockUnavailableError";
  }
}

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
      const lock = await this.tryAcquire(options);
      if (lock) {
        return lock;
      }

      if (attempt < retryCount) {
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
    return [...new Set([this.redis, this.transientRedis])];
  }
}

function getLockKey(resource: string): string {
  return `redlock:${resource}`;
}

function getQuorum(clientCount: number): number {
  return Math.floor(clientCount / 2) + 1;
}

function getValidityMs(
  startedAt: number,
  ttlMs: number,
  driftFactor: number,
): number {
  const elapsedMs = Date.now() - startedAt;
  const driftMs = Math.ceil(ttlMs * driftFactor) + 2;
  return ttlMs - elapsedMs - driftMs;
}

function getRetryDelay(options: RedisLockAcquireOptions): number {
  const delayMs = options.retryDelayMs ?? 100;
  const jitterMs = options.retryJitterMs ?? 50;
  return delayMs + randomInt(Math.max(Math.trunc(jitterMs), 0) + 1);
}

function countSuccesses(results: Array<PromiseSettledResult<boolean>>): number {
  return results.filter(
    (result) => result.status === "fulfilled" && result.value,
  ).length;
}

function isLockAcquired(result: unknown): boolean {
  return result === "OK" || result === true;
}

function assertValidTtl(ttlMs: number): void {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
    throw new Error(`Redis lock ttlMs must be a positive integer: ${ttlMs}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
