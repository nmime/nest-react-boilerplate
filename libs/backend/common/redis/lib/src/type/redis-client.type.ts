export type RedisSetExpirationMode = 'EX' | 'PX';

export type RedisSetCondition = 'NX' | 'XX';

export interface RedisPipelineLike {
  setex(key: string, ttlSeconds: number, value: string): RedisPipelineLike;
  hset(key: string, field: string, value: string): RedisPipelineLike;
  hdel(key: string, field: string): RedisPipelineLike;
  expire(key: string, ttlSeconds: number): RedisPipelineLike;
  del(key: string): RedisPipelineLike;
  exec(): Promise<unknown>;
}

/**
 * Result of an atomic fixed-window counter increment.
 *
 * `resetAt` is derived from the key's actual remaining TTL (PTTL on the real
 * client) rather than a locally computed `Date.now() + windowMs`, so it stays
 * fixed for the lifetime of the window and reflects the authoritative expiry
 * even under clock skew between the caller and Redis.
 */
export interface RedisIncrementWithWindowResult {
  count: number;
  resetAt: number;
}

export interface RedisClientLike {
  /**
   * Stable identity of the underlying connection (mode + host:port/db or url).
   * Clients that talk to the same server share the same value so callers such
   * as Redlock can collapse them to a single logical node before quorum math.
   */
  readonly connectionId?: string;
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode?: RedisSetExpirationMode,
    ttl?: number,
    condition?: RedisSetCondition,
  ): Promise<unknown>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  del(...keys: string[]): Promise<unknown>;
  incr(key: string): Promise<number>;
  /**
   * Atomically increment a fixed-window counter and guarantee it carries a
   * TTL. The counter is created (or reused) and, when it has no expiry yet, a
   * `windowMs` expiry is attached in the same atomic step — closing the race
   * where a counter could be observed without a TTL (or expire between a
   * separate SET and INCR). Returns the post-increment count and the window's
   * reset time derived from the key's actual remaining TTL.
   */
  incrementWithWindow(key: string, windowMs: number): Promise<RedisIncrementWithWindowResult>;
  expire(key: string, ttlSeconds: number): Promise<unknown>;
  hset(key: string, field: string, value: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, field: string): Promise<unknown>;
  deleteIfValue(key: string, expectedValue: string): Promise<boolean>;
  extendIfValue(key: string, expectedValue: string, ttlMs: number): Promise<boolean>;
  pipeline(): RedisPipelineLike;
}
