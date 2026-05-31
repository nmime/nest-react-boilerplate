export type RedisSetExpirationMode = "EX" | "PX";

export type RedisSetCondition = "NX" | "XX";

export interface RedisPipelineLike {
  setex(key: string, ttlSeconds: number, value: string): RedisPipelineLike;
  hset(key: string, field: string, value: string): RedisPipelineLike;
  hdel(key: string, field: string): RedisPipelineLike;
  expire(key: string, ttlSeconds: number): RedisPipelineLike;
  del(key: string): RedisPipelineLike;
  exec(): Promise<unknown>;
}

export interface RedisClientLike {
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
  expire(key: string, ttlSeconds: number): Promise<unknown>;
  hset(key: string, field: string, value: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, field: string): Promise<unknown>;
  deleteIfValue(key: string, expectedValue: string): Promise<boolean>;
  extendIfValue(
    key: string,
    expectedValue: string,
    ttlMs: number,
  ): Promise<boolean>;
  pipeline(): RedisPipelineLike;
}
