import { createClient, createCluster, createSentinel } from "redis";
import { RedisMode } from "./const";
import type {
  RedisClientLike,
  RedisConnectionConfig,
  RedisHost,
  RedisPipelineLike,
  RedisSetCondition,
  RedisSetExpirationMode,
} from "./type";

interface NativeRedisSetOptions {
  expiration?: {
    type: RedisSetExpirationMode;
    value: number;
  };
  condition?: RedisSetCondition;
}

interface NativeRedisClient {
  readonly isOpen: boolean;
  connect(): Promise<unknown>;
  close(): Promise<unknown>;
  destroy(): void | Promise<unknown>;
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: NativeRedisSetOptions,
  ): Promise<string | null>;
  setEx(key: string, ttlSeconds: number, value: string): Promise<string>;
  mGet(keys: string[]): Promise<Array<string | null>>;
  del(keys: string | string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<number | boolean>;
  hSet(key: string, field: string, value: string): Promise<number>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hDel(key: string, field: string): Promise<number>;
  sendCommand(command: string[]): Promise<unknown>;
  on?(event: "error", listener: (error: Error) => void): NativeRedisClient;
}

export class RedisClientAdapter implements RedisClientLike {
  private connectPromise: Promise<unknown> | undefined;

  constructor(
    private readonly client: NativeRedisClient,
    private readonly options: {
      keyPrefix?: string;
    },
  ) {
    this.client.on?.("error", () => undefined);
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
      REDIS_LUA_SCRIPTS[scriptName],
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
    return await closable.destroy();
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
  });
}

function firstHost(hosts: RedisHost[]): RedisHost {
  const host = hosts[0];
  if (!host) {
    throw new Error("At least one Redis host is required.");
  }

  return host;
}

const DELETE_IF_VALUE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end

return 0
`;

const EXTEND_IF_VALUE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
end

return 0
`;

const REDIS_LUA_SCRIPTS = Object.freeze({
  "delete-if-value": DELETE_IF_VALUE_SCRIPT,
  "extend-if-value": EXTEND_IF_VALUE_SCRIPT,
} as const);

type RedisLuaScriptName = keyof typeof REDIS_LUA_SCRIPTS;
