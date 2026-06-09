import type { RedisClientLike, RedisPipelineLike } from "./type";
import type {
  RedisSetCondition,
  RedisSetExpirationMode,
} from "./type/redis-client.type";

interface StoredValue {
  value: string;
  expiresAt?: number;
}

export class InMemoryRedisClient implements RedisClientLike {
  private readonly values = new Map<string, StoredValue>();
  private readonly hashes = new Map<string, Map<string, string>>();
  private readonly hashExpirations = new Map<string, number>();

  ping(): Promise<string> {
    return Promise.resolve("PONG");
  }

  get(key: string): Promise<string | null> {
    this.deleteExpiredKey(key);

    const entry = this.values.get(key);
    if (!entry) {
      return Promise.resolve(null);
    }

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return Promise.resolve(null);
    }

    return Promise.resolve(entry.value);
  }

  set(
    key: string,
    value: string,
    mode?: RedisSetExpirationMode,
    ttl?: number,
    condition?: RedisSetCondition,
  ): Promise<string | null> {
    const exists = this.hasKey(key);
    if (condition === "NX" && exists) {
      return Promise.resolve(null);
    }

    if (condition === "XX" && !exists) {
      return Promise.resolve(null);
    }

    const expiresAt = getExpiration(mode, ttl);
    this.values.set(key, { value, expiresAt });
    this.hashes.delete(key);
    this.hashExpirations.delete(key);
    return Promise.resolve("OK");
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.set(key, value, "EX", ttlSeconds);
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return await Promise.all(keys.map((key) => this.get(key)));
  }

  del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      deleted += this.values.delete(key) ? 1 : 0;
      deleted += this.hashes.delete(key) ? 1 : 0;
      this.hashExpirations.delete(key);
    }

    return Promise.resolve(deleted);
  }

  async incr(key: string): Promise<number> {
    const current = Number((await this.get(key)) ?? "0") + 1;
    this.values.set(key, { value: String(current) });
    return current;
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    this.deleteExpiredKey(key);

    const value = await this.get(key);
    if (value !== null) {
      this.values.set(key, {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return 1;
    }

    if (this.hashes.has(key)) {
      this.hashExpirations.set(key, Date.now() + ttlSeconds * 1000);
      return 1;
    }

    return 0;
  }

  hset(key: string, field: string, value: string): Promise<number> {
    this.deleteExpiredKey(key);

    const hash = this.hashes.get(key) ?? new Map<string, string>();
    const exists = hash.has(field);
    hash.set(field, value);
    this.values.delete(key);
    this.hashes.set(key, hash);
    return Promise.resolve(exists ? 0 : 1);
  }

  hgetall(key: string): Promise<Record<string, string>> {
    this.deleteExpiredKey(key);

    return Promise.resolve(
      Object.fromEntries(this.hashes.get(key)?.entries() ?? []),
    );
  }

  hdel(key: string, field: string): Promise<number> {
    this.deleteExpiredKey(key);

    return Promise.resolve(this.hashes.get(key)?.delete(field) ? 1 : 0);
  }

  async deleteIfValue(key: string, expectedValue: string): Promise<boolean> {
    if ((await this.get(key)) !== expectedValue) {
      return false;
    }

    await this.del(key);
    return true;
  }

  async extendIfValue(
    key: string,
    expectedValue: string,
    ttlMs: number,
  ): Promise<boolean> {
    if ((await this.get(key)) !== expectedValue) {
      return false;
    }

    this.values.set(key, {
      value: expectedValue,
      expiresAt: Date.now() + ttlMs,
    });
    return true;
  }

  pipeline(): RedisPipelineLike {
    return this.pipelineFromOperations([]);
  }

  private pipelineFromOperations(
    operations: (() => Promise<unknown>)[],
  ): RedisPipelineLike {
    return {
      setex: (key, ttl, value) => {
        operations.push(() => this.setex(key, ttl, value));
        return this.pipelineFromOperations(operations);
      },
      hset: (key, field, value) => {
        operations.push(() => this.hset(key, field, value));
        return this.pipelineFromOperations(operations);
      },
      hdel: (key, field) => {
        operations.push(() => this.hdel(key, field));
        return this.pipelineFromOperations(operations);
      },
      expire: (key, ttl) => {
        operations.push(() => this.expire(key, ttl));
        return this.pipelineFromOperations(operations);
      },
      del: (key) => {
        operations.push(() => this.del(key));
        return this.pipelineFromOperations(operations);
      },
      exec: async () =>
        await Promise.all(operations.map((operation) => operation())),
    };
  }

  private hasKey(key: string): boolean {
    this.deleteExpiredKey(key);
    return this.values.has(key) || this.hashes.has(key);
  }

  private deleteExpiredKey(key: string): void {
    const value = this.values.get(key);
    if (value?.expiresAt && value.expiresAt <= Date.now()) {
      this.values.delete(key);
    }

    const hashExpiresAt = this.hashExpirations.get(key);
    if (hashExpiresAt && hashExpiresAt <= Date.now()) {
      this.hashes.delete(key);
      this.hashExpirations.delete(key);
    }
  }
}

function getExpiration(
  mode: RedisSetExpirationMode | undefined,
  ttl: number | undefined,
): number | undefined {
  if (!mode || ttl === undefined) {
    return undefined;
  }

  return mode === "EX" ? Date.now() + ttl * 1000 : Date.now() + ttl;
}
