import { Logger } from "@nestjs/common";
import { createClient, createCluster, createSentinel } from "redis";
import { RedisMode } from "./const";
import { redisLuaScripts } from "./const/redis-lua-script.const";
import type { RedisLuaScriptName } from "./const/redis-lua-script.const";
import type {
  RedisClientLike,
  RedisConnectionConfig,
  RedisIncrementWithWindowResult,
  RedisPipelineLike,
  RedisSetCondition,
  RedisSetExpirationMode,
} from "./type";
import type {
  NativeRedisClient,
  NativeRedisSetOptions,
} from "./type/native-redis-client.type";
import { connectionIdentity, firstHost } from "./util";

export class RedisClientAdapter implements RedisClientLike {
  private static readonly logger = new Logger(RedisClientAdapter.name);
  private connectPromise: Promise<unknown> | undefined;

  readonly connectionId?: string;

  constructor(
    private readonly client: NativeRedisClient,
    private readonly options: {
      keyPrefix?: string;
      connectionId?: string;
    },
  ) {
    this.connectionId = options.connectionId;
    this.client.on?.("error", (error) => {
      RedisClientAdapter.logger.error(
        "Redis client connection error",
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  async ping(): Promise<string> {
    await this.ensureConnected();
    return await this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    await this.ensureConnected();
    return await this.client.get(this.key(key));
  }

  async set(
    key: string,
    value: string,
    mode?: RedisSetExpirationMode,
    ttl?: number,
    condition?: RedisSetCondition,
  ): Promise<unknown> {
    await this.ensureConnected();
    const options: NativeRedisSetOptions = {};
    if (mode && ttl !== undefined) {
      options.expiration = {
        type: mode,
        value: ttl,
      };
    }

    if (condition) {
      options.condition = condition;
    }

    return await this.client.set(this.key(key), value, options);
  }

  async setex(
    key: string,
    ttlSeconds: number,
    value: string,
  ): Promise<unknown> {
    await this.ensureConnected();
    return await this.client.setEx(this.key(key), ttlSeconds, value);
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    await this.ensureConnected();
    return await this.client.mGet(keys.map((key) => this.key(key)));
  }

  async del(...keys: string[]): Promise<unknown> {
    await this.ensureConnected();
    return await this.client.del(keys.map((key) => this.key(key)));
  }

  async incr(key: string): Promise<number> {
    await this.ensureConnected();
    return await this.client.incr(this.key(key));
  }

  async incrementWithWindow(
    key: string,
    windowMs: number,
  ): Promise<RedisIncrementWithWindowResult> {
    const ttlMs = Math.max(Math.trunc(windowMs), 1);
    // A fixed Lua script performs INCR, reads PTTL, and attaches PEXPIRE only
    // when the key has no TTL yet — all in a single atomic server-side step,
    // so the counter can never be observed (or expire) between operations.
    const result = await this.runKnownLuaScript(
      "increment-window",
      key,
      String(ttlMs),
    );
    const reply = (Array.isArray(result) ? result : []) as unknown[];
    const remainingMs = Number(reply[1]);
    return {
      count: Number(reply[0]),
      // PTTL reflects the authoritative remaining window; fall back to the
      // requested window only if the reply is malformed so resetAt stays sane.
      resetAt:
        Date.now() +
        (Number.isFinite(remainingMs) && remainingMs >= 0
          ? remainingMs
          : ttlMs),
    };
  }

  async expire(key: string, ttlSeconds: number): Promise<unknown> {
    await this.ensureConnected();
    return await this.client.expire(this.key(key), ttlSeconds);
  }

  async hset(key: string, field: string, value: string): Promise<unknown> {
    await this.ensureConnected();
    return await this.client.hSet(this.key(key), field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    await this.ensureConnected();
    return await this.client.hGetAll(this.key(key));
  }

  async hdel(key: string, field: string): Promise<unknown> {
    await this.ensureConnected();
    return await this.client.hDel(this.key(key), field);
  }

  async deleteIfValue(key: string, expectedValue: string): Promise<boolean> {
    const result = await this.runKnownLuaScript(
      "delete-if-value",
      key,
      expectedValue,
    );
    return Number(result) === 1;
  }

  async extendIfValue(
    key: string,
    expectedValue: string,
    ttlMs: number,
  ): Promise<boolean> {
    const result = await this.runKnownLuaScript(
      "extend-if-value",
      key,
      expectedValue,
      String(ttlMs),
    );

    return Number(result) === 1;
  }

  pipeline(): RedisPipelineLike {
    return this.pipelineFromOperations([]);
  }

  async close(): Promise<unknown> {
    if (!this.client.isOpen) {
      return undefined;
    }

    return await this.client.close();
  }

  async destroy(): Promise<unknown> {
    return await this.client.destroy();
  }

  private async runKnownLuaScript(
    scriptName: RedisLuaScriptName,
    key: string,
    ...args: string[]
  ): Promise<unknown> {
    await this.ensureConnected();
    return await this.client.sendCommand([
      "EVAL",
      redisLuaScripts[scriptName],
      "1",
      this.key(key),
      ...args,
    ]);
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

  private async ensureConnected(): Promise<void> {
    if (this.client.isOpen) {
      return;
    }

    this.connectPromise ??= this.client.connect().finally(() => {
      this.connectPromise = undefined;
    });

    await this.connectPromise;
  }

  private key(key: string): string {
    return this.options.keyPrefix ? `${this.options.keyPrefix}${key}` : key;
  }
}

export function createRedisClient(
  config: RedisConnectionConfig,
): RedisClientLike {
  if (config.mode === RedisMode.Cluster) {
    return createClusterClient(config);
  }

  if (config.mode === RedisMode.Sentinel) {
    return createSentinelClient(config);
  }

  return createSingleClient(config);
}

export async function closeRedisClient(
  client: RedisClientLike,
): Promise<unknown> {
  const closable = client as RedisClientLike & {
    close?: () => Promise<unknown>;
    destroy?: () => Promise<void> | void;
  };

  if (typeof closable.close === "function") {
    return await closable.close();
  }

  if (typeof closable.destroy === "function") {
    await closable.destroy();
    return;
  }

  return undefined;
}

function createSingleClient(config: RedisConnectionConfig): RedisClientLike {
  const host = firstHost(config.hosts);
  const client = config.url
    ? createClient({
        url: config.url,
        password: config.password,
        database: config.db,
      })
    : createClient({
        socket: {
          host: host.host,
          port: host.port,
        },
        password: config.password,
        database: config.db,
      });

  return toAdapter(client, config);
}

function createClusterClient(config: RedisConnectionConfig): RedisClientLike {
  const client = createCluster({
    rootNodes: config.hosts.map((host) => ({
      socket: {
        host: host.host,
        port: host.port,
      },
    })),
    defaults: {
      password: config.password,
      database: config.db,
    },
    useReplicas: true,
  });

  return toAdapter(client, config);
}

function createSentinelClient(config: RedisConnectionConfig): RedisClientLike {
  if (!config.sentinelGroupIdentifier) {
    throw new Error(
      "Redis sentinel mode requires a sentinel group identifier.",
    );
  }

  const client = createSentinel({
    name: config.sentinelGroupIdentifier,
    sentinelRootNodes: config.hosts,
    nodeClientOptions: {
      password: config.password,
      database: config.db,
    },
    sentinelClientOptions: {
      password: config.password,
    },
    replicaPoolSize: 1,
  });

  return toAdapter(client, config);
}

function toAdapter(
  client: unknown,
  config: RedisConnectionConfig,
): RedisClientLike {
  return new RedisClientAdapter(client as NativeRedisClient, {
    keyPrefix: config.keyPrefix,
    connectionId: connectionIdentity(config),
  });
}
