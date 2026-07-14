import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { Cacheable, CacheableEvents, Keyv, type KeyvStoreAdapter } from 'cacheable';
import { InjectRedis } from './decorator';
import type { RedisClientLike } from './type';
import type { CacheableErrorListener, CacheOperationContext } from './type/redis-cache.type';
import { deserializeValue, isPresent, toCacheableTtlMilliseconds, toError } from './util';

@Injectable()
export class RedisCacheService {
  private readonly cache: Cacheable;
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly operationStorage = new AsyncLocalStorage<CacheOperationContext>();

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
    const cachedValues = await this.runCacheableOperation(() => this.cache.getMany<string>(uniqueKeys));
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

  async setHash<T>(hashKey: string, values: Record<string, T>, ttl: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const [field, value] of Object.entries(values)) {
      pipeline.hset(hashKey, field, JSON.stringify(value));
    }
    pipeline.expire(hashKey, ttl);
    await pipeline.exec();
  }

  async getHash<T>(hashKey: string): Promise<Record<string, T>> {
    const result = await this.redis.hgetall(hashKey);
    return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, JSON.parse(value) as T]));
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
    if (isPresent(value) && !params.skip?.(value)) {
      await this.runCacheableOperation(() =>
        this.cache.set(
          params.key,
          params.serialize?.(value as Exclude<T, null | undefined>) ?? JSON.stringify(value),
          toCacheableTtlMilliseconds(params.ttl),
        ),
      );
    }

    return value;
  }

  private async getCachedValue(key: string): Promise<string | undefined> {
    return await this.runCacheableOperation(() => this.cache.get<string>(key));
  }

  private async runCacheableOperation<T>(operation: () => Promise<T>): Promise<T> {
    // Cacheable swallows store failures and re-emits them on a shared emitter,
    // so a concurrent operation could otherwise capture another operation's
    // error. The error is emitted synchronously inside the failing operation's
    // async context, so we correlate it by matching the active context against
    // this operation's own context instead of trusting the raw event.
    const context: CacheOperationContext = {};
    const onError: CacheableErrorListener = (error) => {
      const active = this.operationStorage.getStore();
      if (active === context) {
        active.error ??= error;
      }
    };

    this.cache.on(CacheableEvents.ERROR, onError);
    try {
      const result = await this.operationStorage.run(context, operation);
      if (context.error) {
        throw toError(context.error);
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
    return values.map((value) => (value === null ? undefined : (value as Value)));
  }

  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    /* v8 ignore start -- KeyvStoreAdapter contract branch: RedisCacheService always writes a clamped, strictly-positive TTL (see toCacheableTtlMilliseconds), so Cacheable/Keyv never route a non-positive TTL to this deletion path. */
    if (ttl !== undefined && ttl <= 0) {
      const deleted = await this.redis.del(key);
      return Number(deleted) > 0;
    }
    /* v8 ignore stop */

    /* v8 ignore start -- KeyvStoreAdapter contract branch: RedisCacheService always writes a defined, strictly-positive TTL, so Cacheable/Keyv never invoke the no-TTL set() form. */
    const result =
      ttl === undefined
        ? await this.redis.set(key, String(value))
        : await this.redis.set(key, String(value), 'PX', Math.ceil(ttl));
    /* v8 ignore stop */

    return result !== null;
  }

  async setMany(values: Array<{ key: string; value: unknown; ttl?: number }>): Promise<void> {
    await Promise.all(values.map((value) => this.set(value.key, value.value, value.ttl)));
  }

  async delete(key: string): Promise<boolean> {
    const deleted = await this.redis.del(key);
    return Number(deleted) > 0;
  }

  /* v8 ignore start -- KeyvStoreAdapter contract methods: RedisCacheService only issues single-key deletes (invalidateCache) and never clears the store, so Cacheable/Keyv never route to deleteMany() or clear(). They exist solely to satisfy the KeyvStoreAdapter interface. */
  async deleteMany(keys: string[]): Promise<boolean> {
    if (keys.length === 0) {
      return true;
    }

    const deleted = await this.redis.del(...keys);
    return Number(deleted) > 0;
  }

  clear(): Promise<void> {
    return Promise.reject(new Error('RedisCacheService does not support clearing Redis.'));
  }
  /* v8 ignore stop */
}
