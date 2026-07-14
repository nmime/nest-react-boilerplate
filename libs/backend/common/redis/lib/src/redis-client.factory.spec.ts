import { Logger } from '@nestjs/common';
import { createClient, createCluster, createSentinel } from 'redis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisMode } from './const';
import { closeRedisClient, createRedisClient, RedisClientAdapter } from './redis-client.factory';
import type { RedisConnectionConfig } from './type';
import type { NativeRedisClient } from './type/native-redis-client.type';

vi.mock('redis', () => ({
  createClient: vi.fn(() => ({ tag: 'single' })),
  createCluster: vi.fn(() => ({ tag: 'cluster' })),
  createSentinel: vi.fn(() => ({ tag: 'sentinel' })),
}));

const createClientMock = vi.mocked(createClient);
const createClusterMock = vi.mocked(createCluster);
const createSentinelMock = vi.mocked(createSentinel);

function baseConfig(overrides: Partial<RedisConnectionConfig> = {}): RedisConnectionConfig {
  return {
    mode: RedisMode.Single,
    hosts: [{ host: 'redis-a', port: 6379 }],
    lazyConnect: false,
    ...overrides,
  };
}

describe('createRedisClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a single client from socket host/port and identifies it by host', () => {
    const client = createRedisClient(baseConfig({ password: 'secret', db: 3 }));

    expect(client).toBeInstanceOf(RedisClientAdapter);
    expect(client.connectionId).toBe('single:redis-a:6379/3');
    expect(createClientMock).toHaveBeenCalledWith({
      socket: { host: 'redis-a', port: 6379 },
      password: 'secret',
      database: 3,
    });
  });

  it('builds a single client from a url and identifies it by url with default db', () => {
    const client = createRedisClient(baseConfig({ url: 'redis://redis-a:6379', db: undefined }));

    expect(client.connectionId).toBe('single:redis://redis-a:6379/0');
    expect(createClientMock).toHaveBeenCalledWith({
      url: 'redis://redis-a:6379',
      password: undefined,
      database: undefined,
    });
  });

  it('requires at least one host for single mode without a url', () => {
    expect(() => createRedisClient(baseConfig({ hosts: [] }))).toThrow('At least one Redis host is required.');
  });

  it('builds a cluster client across all root nodes', () => {
    const client = createRedisClient(
      baseConfig({
        mode: RedisMode.Cluster,
        hosts: [
          { host: 'redis-a', port: 7000 },
          { host: 'redis-b', port: 7001 },
        ],
        password: 'pw',
        db: 1,
      }),
    );

    expect(client.connectionId).toBe('cluster:redis-a:7000,redis-b:7001/1');
    expect(createClusterMock).toHaveBeenCalledWith({
      rootNodes: [{ socket: { host: 'redis-a', port: 7000 } }, { socket: { host: 'redis-b', port: 7001 } }],
      defaults: { password: 'pw', database: 1 },
      useReplicas: true,
    });
  });

  it('builds a sentinel client when a group identifier is present', () => {
    const client = createRedisClient(
      baseConfig({
        mode: RedisMode.Sentinel,
        sentinelGroupIdentifier: 'mymaster',
        hosts: [{ host: 'sentinel-a', port: 26379 }],
      }),
    );

    expect(client).toBeInstanceOf(RedisClientAdapter);
    expect(createSentinelMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'mymaster', replicaPoolSize: 1 }));
  });

  it('rejects sentinel mode without a group identifier', () => {
    expect(() => createRedisClient(baseConfig({ mode: RedisMode.Sentinel }))).toThrow(
      'Redis sentinel mode requires a sentinel group identifier.',
    );
  });
});

describe('closeRedisClient', () => {
  it('prefers close() when available', async () => {
    const close = vi.fn(() => Promise.resolve('closed'));
    const client: Partial<NativeRedisClient> = { close };
    await expect(closeRedisClient(client as never)).resolves.toBe('closed');
    expect(close).toHaveBeenCalledOnce();
  });

  it('falls back to destroy() when close() is absent', async () => {
    const destroy = vi.fn(() => undefined);
    const client: Partial<NativeRedisClient> = { destroy };
    await expect(closeRedisClient(client as never)).resolves.toBeUndefined();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('returns undefined when neither close() nor destroy() exist', async () => {
    const client: Partial<NativeRedisClient> = {};
    await expect(closeRedisClient(client as never)).resolves.toBeUndefined();
  });
});

describe('RedisClientAdapter', () => {
  function fakeNativeClient(
    overrides: Partial<NativeRedisClient> = {},
  ): NativeRedisClient & { errorListener?: (error: Error) => void } {
    const client = {
      isOpen: true,
      errorListener: undefined as ((error: Error) => void) | undefined,
      connect: vi.fn(() => Promise.resolve(undefined)),
      close: vi.fn(() => Promise.resolve('closed')),
      destroy: vi.fn(() => Promise.resolve(undefined)),
      ping: vi.fn(() => Promise.resolve('PONG')),
      get: vi.fn(() => Promise.resolve('value')),
      set: vi.fn(() => Promise.resolve('OK')),
      setEx: vi.fn(() => Promise.resolve('OK')),
      mGet: vi.fn(() => Promise.resolve(['a', null])),
      del: vi.fn(() => Promise.resolve(1)),
      incr: vi.fn(() => Promise.resolve(2)),
      expire: vi.fn(() => Promise.resolve(1)),
      hSet: vi.fn(() => Promise.resolve(1)),
      hGetAll: vi.fn(() => Promise.resolve({ field: 'value' })),
      hDel: vi.fn(() => Promise.resolve(1)),
      sendCommand: vi.fn(() => Promise.resolve(1)),
      on(event: 'error', listener: (error: Error) => void) {
        this.errorListener = listener;
        return this as unknown as NativeRedisClient;
      },
      ...overrides,
    };
    return client;
  }

  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs connection errors, distinguishing Error from non-Error payloads', () => {
    const client = fakeNativeClient();
    const adapter = new RedisClientAdapter(client, { connectionId: 'id' });
    expect(adapter).toBeInstanceOf(RedisClientAdapter);

    client.errorListener?.(new Error('boom'));
    client.errorListener?.('stringly-typed' as unknown as Error);

    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('tolerates a native client without an error listener hook', () => {
    const client = fakeNativeClient({ on: undefined });
    expect(() => new RedisClientAdapter(client, {})).not.toThrow();
  });

  it('prefixes keys on every keyed operation', async () => {
    const client = fakeNativeClient();
    const adapter = new RedisClientAdapter(client, { keyPrefix: 'app:' });

    await adapter.get('k');
    await adapter.setex('k', 60, 'v');
    await adapter.mget('k1', 'k2');
    await adapter.del('k1', 'k2');
    await adapter.incr('k');
    await adapter.expire('k', 30);
    await adapter.hset('h', 'f', 'v');
    await adapter.hgetall('h');
    await adapter.hdel('h', 'f');

    expect(client.get).toHaveBeenCalledWith('app:k');
    expect(client.setEx).toHaveBeenCalledWith('app:k', 60, 'v');
    expect(client.mGet).toHaveBeenCalledWith(['app:k1', 'app:k2']);
    expect(client.del).toHaveBeenCalledWith(['app:k1', 'app:k2']);
    expect(client.incr).toHaveBeenCalledWith('app:k');
    expect(client.expire).toHaveBeenCalledWith('app:k', 30);
    expect(client.hSet).toHaveBeenCalledWith('app:h', 'f', 'v');
    expect(client.hGetAll).toHaveBeenCalledWith('app:h');
    expect(client.hDel).toHaveBeenCalledWith('app:h', 'f');
    await expect(adapter.ping()).resolves.toBe('PONG');
    await expect(adapter.hgetall('h')).resolves.toEqual({ field: 'value' });
  });

  it('passes keys through unchanged when no prefix is configured', async () => {
    const client = fakeNativeClient();
    const adapter = new RedisClientAdapter(client, {});

    await adapter.get('k');
    expect(client.get).toHaveBeenCalledWith('k');
  });

  it('maps set() modes and conditions onto native options', async () => {
    const client = fakeNativeClient();
    const adapter = new RedisClientAdapter(client, {});

    await adapter.set('k', 'v', 'PX', 1000, 'NX');
    expect(client.set).toHaveBeenLastCalledWith('k', 'v', {
      expiration: { type: 'PX', value: 1000 },
      condition: 'NX',
    });

    await adapter.set('k', 'v');
    expect(client.set).toHaveBeenLastCalledWith('k', 'v', {});
  });

  it('derives incrementWithWindow reset from the PTTL reply', async () => {
    const client = fakeNativeClient({
      sendCommand: vi.fn(() => Promise.resolve([5, 4200])),
    });
    const adapter = new RedisClientAdapter(client, {});
    const before = Date.now();

    const result = await adapter.incrementWithWindow('rate', 5000);

    expect(result.count).toBe(5);
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 4200);
  });

  it('falls back to the requested window when the reply is malformed', async () => {
    const client = fakeNativeClient({
      sendCommand: vi.fn(() => Promise.resolve('not-an-array')),
    });
    const adapter = new RedisClientAdapter(client, {});
    const before = Date.now();

    const result = await adapter.incrementWithWindow('rate', 2000);

    expect(result.count).toBeNaN();
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 2000);
  });

  it('runs pipelined operations in order on exec()', async () => {
    const client = fakeNativeClient();
    const adapter = new RedisClientAdapter(client, {});

    await adapter.pipeline().setex('k', 60, 'v').hset('h', 'f', 'v').hdel('h', 'f').expire('k', 30).del('k').exec();

    expect(client.setEx).toHaveBeenCalledOnce();
    expect(client.hSet).toHaveBeenCalledOnce();
    expect(client.hDel).toHaveBeenCalledOnce();
    expect(client.expire).toHaveBeenCalledOnce();
    expect(client.del).toHaveBeenCalledOnce();
  });

  it('connects lazily once and reuses the in-flight connect promise', async () => {
    let open = false;
    let resolveConnect: () => void = () => undefined;
    const connect = vi.fn(
      () =>
        new Promise<undefined>((resolve) => {
          resolveConnect = () => {
            open = true;
            resolve(undefined);
          };
        }),
    );
    const client = fakeNativeClient({ connect });
    Object.defineProperty(client, 'isOpen', { get: () => open });
    const adapter = new RedisClientAdapter(client, {});

    // Two concurrent operations share the single in-flight connect promise.
    const inFlight = Promise.all([adapter.get('a'), adapter.get('b')]);
    resolveConnect();
    await inFlight;
    expect(connect).toHaveBeenCalledOnce();

    // Once connected, further operations skip connect entirely.
    await adapter.get('c');
    expect(connect).toHaveBeenCalledOnce();
  });

  it('closes only when the native client is open', async () => {
    const openClient = fakeNativeClient({ isOpen: true });
    const openAdapter = new RedisClientAdapter(openClient, {});
    await expect(openAdapter.close()).resolves.toBe('closed');
    expect(openClient.close).toHaveBeenCalledOnce();

    const closedClient = fakeNativeClient({ isOpen: false });
    const closedAdapter = new RedisClientAdapter(closedClient, {});
    await expect(closedAdapter.close()).resolves.toBeUndefined();
    expect(closedClient.close).not.toHaveBeenCalled();
  });

  it('delegates destroy() to the native client', async () => {
    const client = fakeNativeClient();
    const adapter = new RedisClientAdapter(client, {});
    await adapter.destroy();
    expect(client.destroy).toHaveBeenCalledOnce();
  });
});
