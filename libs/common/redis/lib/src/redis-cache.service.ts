import { Injectable } from "@nestjs/common";
import {
  Cacheable,
  CacheableEvents,
  Keyv,
  type KeyvStoreAdapter,
} from "cacheable";
import { InjectRedis } from "./decorator";
import type { RedisClientLike } from "./type";

type CacheableErrorListener = (error: unknown) => void;

@Injectable()
export class RedisCacheService {
  private readonly cache: Cacheable;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(@InjectRedis() private readonly redis: RedisClientLike) {
    this.cache = new Cacheable({
      primary: new Keyv({
        store: new RedisKeyvStoreAdapter(redis),
        throwOnErrors: true,
        useKeyPrefix: false,
      }),
    });
  }

  async withCache<T>(params: {
    key: string;
    ttl: number;
    action: () => Promise<T>;
    serialize?: (value: Exclude<T, null | undefined>) => string;
    deserialize?: (raw: string) => T;
    skip?: (value: T) => boolean;
  }): Promise<T> {
    const cached = await this.getCachedValue(params.key);
    if (cached !== undefined) {
      return deserializeValue(cached, params.deserialize);
    }

    const existing = this.inflight.get(params.key);
    if (existing) {
      return (await existing) as T;
    }

    const promise = this.fetchAndStore(params);
    this.inflight.set(params.key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(params.key);
    }
  }

  async invalidateCache(params: { key: string }): Promise<void> {
    await this.runCacheableOperation(() => this.cache.delete(params.key));
  }

  async withCacheBatch<T>(params: {
    keys: string[];
    fetchMissing: (missingKeys: string[]) => Promise<Map<string, T>>;
    ttl: number;
    serialize?: (value: T) => string;
    deserialize?: (raw: string) => T;
  }): Promise<Map<string, T>> {
    const uniqueKeys = [...new Set(params.keys)];
    const cachedValues = await this.runCacheableOperation(() =>
      this.cache.getMany<string>(uniqueKeys),
    );
    const result = new Map<string, T>();
    const missingKeys: string[] = [];

    uniqueKeys.forEach((key, index) => {
      const cached = cachedValues[index];
      if (cached === undefined) {
        missingKeys.push(key);
      } else {
        result.set(key, deserializeValue(cached, params.deserialize));
      }
    });

    if (missingKeys.length > 0) {
      const fetched = await params.fetchMissing(missingKeys);
      for (const [key, value] of fetched) {
        result.set(key, value);
      }

      await this.runCacheableOperation(() =>
        this.cache.setMany(
          [...fetched].map(([key, value]) => ({
            key,
            value: params.serialize?.(value) ?? JSON.stringify(value),
            ttl: toCacheableTtlMilliseconds(params.ttl),
          })),
        ),
      );
    }

    return result;
  }

  async setHash<T>(
    hashKey: string,
    values: Record<string, T>,
    ttl: number,
  ): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const [field, value] of Object.entries(values)) {
      pipeline.hset(hashKey, field, JSON.stringify(value));
    }
    pipeline.expire(hashKey, ttl);
    await pipeline.exec();
  }

  async getHash<T>(hashKey: string): Promise<Record<string, T>> {
    const result = await this.redis.hgetall(hashKey);
    return Object.fromEntries(
      Object.entries(result).map(([key, value]) => [
        key,
        JSON.parse(value) as T,
      ]),
    );
  }

  async deleteFromHash(hashKey: string, field: string): Promise<void> {
    await this.redis.hdel(hashKey, field);
  }

  private async fetchAndStore<T>(params: {
    key: string;
    ttl: number;
    action: () => Promise<T>;
    serialize?: (value: Exclude<T, null | undefined>) => string;
    skip?: (value: T) => boolean;
  }): Promise<T> {
    const value = await params.action();
    if (value != null && !params.skip?.(value)) {
      await this.runCacheableOperation(() =>
        this.cache.set(
          params.key,
          params.serialize?.(value as Exclude<T, null | undefined>) ??
            JSON.stringify(value),
          toCacheableTtlMilliseconds(params.ttl),
        ),
      );
    }

    return value;
  }

  private async getCachedValue(key: string): Promise<string | undefined> {
    return await this.runCacheableOperation(() => this.cache.get<string>(key));
  }

  private async runCacheableOperation<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    let operationError: unknown;
    const onError: CacheableErrorListener = (error) => {
      operationError ??= error;
    };

    this.cache.on(CacheableEvents.ERROR, onError);
    try {
      const result = await operation();
      if (operationError) {
        throw toError(operationError);
      }

      return result;
    } finally {
      this.cache.off(CacheableEvents.ERROR, onError);
    }
  }
}

class RedisKeyvStoreAdapter implements KeyvStoreAdapter {
  readonly opts = {};
  namespace?: string;

  constructor(private readonly redis: RedisClientLike) {}

  on(): this {
    return this;
  }

  async get<Value>(key: string): Promise<Value | undefined> {
    const value = await this.redis.get(key);
    return (value === null ? undefined : value) as Value | undefined;
  }

  async getMany<Value>(keys: string[]): Promise<Array<Value | undefined>> {
    const values = await this.redis.mget(...keys);
    return values.map((value) =>
      value === null ? undefined : (value as Value),
    );
  }

  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    if (ttl !== undefined && ttl <= 0) {
      const deleted = await this.redis.del(key);
      return Number(deleted) > 0;
    }

    const result =
      ttl === undefined
        ? await this.redis.set(key, String(value))
        : await this.redis.set(key, String(value), "PX", Math.ceil(ttl));

    return result !== null;
  }

  async setMany(
    values: Array<{ key: string; value: unknown; ttl?: number }>,
  ): Promise<void> {
    await Promise.all(
      values.map((value) => this.set(value.key, value.value, value.ttl)),
    );
  }

  async delete(key: string): Promise<boolean> {
    const deleted = await this.redis.del(key);
    return Number(deleted) > 0;
  }

  async deleteMany(keys: string[]): Promise<boolean> {
    if (keys.length === 0) {
      return true;
    }

    const deleted = await this.redis.del(...keys);
    return Number(deleted) > 0;
  }

  clear(): Promise<void> {
    return Promise.reject(
      new Error("RedisCacheService does not support clearing Redis."),
    );
  }
}

function deserializeValue<T>(
  cached: string,
  deserialize: ((raw: string) => T) | undefined,
): T {
  return (deserialize?.(cached) ?? JSON.parse(cached)) as T;
}

function toCacheableTtlMilliseconds(ttlSeconds: number): number {
  return Math.max(Math.ceil(ttlSeconds * 1000), 1);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
