import { Injectable } from "@nestjs/common";
import { InjectRedis } from "./decorator";
import type { RedisClientLike } from "./type";

@Injectable()
export class RedisCacheService {
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(@InjectRedis() private readonly redis: RedisClientLike) {}

  async withCache<T>(params: {
    key: string;
    ttl: number;
    action: () => Promise<T>;
    serialize?: (value: Exclude<T, null | undefined>) => string;
    deserialize?: (raw: string) => T;
    skip?: (value: T) => boolean;
  }): Promise<T> {
    const cached = await this.redis.get(params.key);
    if (cached !== null) {
      return (params.deserialize?.(cached) ?? JSON.parse(cached)) as T;
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
    await this.redis.del(params.key);
  }

  async withCacheBatch<T>(params: {
    keys: string[];
    fetchMissing: (missingKeys: string[]) => Promise<Map<string, T>>;
    ttl: number;
    serialize?: (value: T) => string;
    deserialize?: (raw: string) => T;
  }): Promise<Map<string, T>> {
    const uniqueKeys = [...new Set(params.keys)];
    const cachedValues = await this.redis.mget(...uniqueKeys);
    const result = new Map<string, T>();
    const missingKeys: string[] = [];

    uniqueKeys.forEach((key, index) => {
      const cached = cachedValues[index];
      if (cached === null) {
        missingKeys.push(key);
      } else {
        result.set(
          key,
          (params.deserialize?.(cached) ?? JSON.parse(cached)) as T,
        );
      }
    });

    if (missingKeys.length > 0) {
      const fetched = await params.fetchMissing(missingKeys);
      const pipeline = this.redis.pipeline();
      for (const [key, value] of fetched) {
        result.set(key, value);
        pipeline.setex(
          key,
          params.ttl,
          params.serialize?.(value) ?? JSON.stringify(value),
        );
      }
      await pipeline.exec();
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
      await this.redis.setex(
        params.key,
        params.ttl,
        params.serialize?.(value as Exclude<T, null | undefined>) ??
          JSON.stringify(value),
      );
    }

    return value;
  }
}
