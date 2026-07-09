import type { StorageAdapter } from "grammy";
import type { RedisClientLike } from "@app/backend-common-redis";

export interface TelegramRedisSessionStorageOptions {
  redisClient: RedisClientLike;
  keyPrefix?: string;
  ttlSeconds: number;
}

/**
 * Native Redis-backed session storage for Grammy, using the shared
 * `RedisClientLike` abstraction (node-redis v6) instead of ioredis.
 *
 * Replaces `@grammyjs/storage-redis` which requires ioredis as a peer
 * dependency.
 */
export class RedisSessionStorage<T = unknown> implements StorageAdapter<T> {
  private readonly client: RedisClientLike;
  private readonly keyPrefix: string;
  private readonly ttlSeconds: number;

  constructor(options: TelegramRedisSessionStorageOptions) {
    this.client = options.redisClient;
    this.keyPrefix = options.keyPrefix ?? "tg:session:";
    this.ttlSeconds = options.ttlSeconds;
  }

  async read(id: string): Promise<T | undefined> {
    const key = this.keyPrefix + id;
    const raw = await this.client.get(key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  }

  async write(id: string, value: T): Promise<void> {
    const key = this.keyPrefix + id;
    await this.client.setex(key, this.ttlSeconds, JSON.stringify(value));
  }

  async deleteAndWrite(id: string, value: T): Promise<void> {
    // RedisClientLike doesn't have a dedicated deleteAndWrite — just
    // overwrite. In the rare race where two writes collide the later one
    // wins, which is acceptable for Telegram bot sessions.
    await this.write(id, value);
  }

  async delete(id: string): Promise<void> {
    const key = this.keyPrefix + id;
    await this.client.del(key);
  }
}
