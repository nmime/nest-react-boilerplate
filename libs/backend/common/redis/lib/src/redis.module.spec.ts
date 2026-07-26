// @requirements REQ-RUNTIME-MESSAGING-006
import type { Provider } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisConfigService } from './config';
import { RedisInjectToken, RedisMode, RedisTransientInjectToken } from './const';
import { InMemoryRedisClient } from './in-memory-redis.client';
import { closeRedisClient, createRedisClient } from './redis-client.factory';
import { RedisModule } from './redis.module';
import type { RedisClientLike, RedisConfig } from './type';

vi.mock('./redis-client.factory', () => ({
  createRedisClient: vi.fn(() => ({ tag: 'created' })),
  closeRedisClient: vi.fn(() => Promise.resolve()),
}));

const createRedisClientMock = vi.mocked(createRedisClient);
const closeRedisClientMock = vi.mocked(closeRedisClient);

interface FactoryProvider {
  provide: unknown;
  useFactory: (config: RedisConfigService) => RedisClientLike;
}

interface ValueProvider {
  provide: unknown;
  useValue: RedisConfigService;
}

function isRecordProvider(provider: Provider): provider is Provider & {
  provide: unknown;
} {
  return typeof provider === 'object' && 'provide' in provider;
}

function resolveClient(options: RedisConfig, token: symbol): RedisClientLike {
  const providers = RedisModule.forRoot(options).providers ?? [];
  const configProvider = providers.find(
    (provider): provider is Provider & ValueProvider =>
      isRecordProvider(provider) && provider.provide === RedisConfigService && 'useValue' in provider,
  );
  const factoryProvider = providers.find(
    (provider): provider is Provider & FactoryProvider =>
      isRecordProvider(provider) && provider.provide === token && 'useFactory' in provider,
  );
  if (!configProvider || !factoryProvider) {
    throw new Error('Expected Redis providers to be registered.');
  }

  return factoryProvider.useFactory(configProvider.useValue);
}

describe('RedisModule.forRoot', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();
    savedEnv = { ...process.env };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('REDIS_')) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('exposes every Redis provider both as providers and exports', () => {
    const module = RedisModule.forRoot();
    expect(module.module).toBe(RedisModule);
    expect(module.providers).toEqual(module.exports);
    expect(module.providers?.length).toBeGreaterThan(0);
  });

  it('falls back to an in-memory client when no connection is configured', () => {
    const client = resolveClient({}, RedisInjectToken);
    expect(client).toBeInstanceOf(InMemoryRedisClient);
    expect(createRedisClientMock).not.toHaveBeenCalled();
  });

  it('creates a real client when a connection is configured', () => {
    const client = resolveClient(
      { mode: RedisMode.Single, hosts: [{ host: 'redis-a', port: 6379 }] },
      RedisInjectToken,
    );
    expect(createRedisClientMock).toHaveBeenCalledOnce();
    expect(client).toEqual({ tag: 'created' });
  });

  it('uses an explicitly provided client verbatim', () => {
    const provided = new InMemoryRedisClient();
    const client = resolveClient({ client: provided }, RedisInjectToken);
    expect(client).toBe(provided);
    expect(createRedisClientMock).not.toHaveBeenCalled();
  });

  it('prefers the transient client, then the shared client, for the transient token', () => {
    const transient = new InMemoryRedisClient();
    const shared = new InMemoryRedisClient();

    expect(resolveClient({ transientClient: transient, client: shared }, RedisTransientInjectToken)).toBe(transient);
    expect(resolveClient({ client: shared }, RedisTransientInjectToken)).toBe(shared);
    expect(resolveClient({}, RedisTransientInjectToken)).toBeInstanceOf(InMemoryRedisClient);
  });

  it('closes each unique client exactly once on application shutdown', async () => {
    const providers = RedisModule.forRoot().providers ?? [];
    const ShutdownService = providers.find(
      (
        provider,
      ): provider is new (
        redis: RedisClientLike,
        transient: RedisClientLike,
      ) => { onApplicationShutdown(): Promise<void> } =>
        typeof provider === 'function' && provider.name === 'RedisShutdownService',
    );
    if (!ShutdownService) {
      throw new Error('Expected RedisShutdownService to be registered.');
    }

    const shared = new InMemoryRedisClient();
    await new ShutdownService(shared, new InMemoryRedisClient()).onApplicationShutdown();
    expect(closeRedisClientMock).toHaveBeenCalledTimes(2);

    closeRedisClientMock.mockClear();
    await new ShutdownService(shared, shared).onApplicationShutdown();
    expect(closeRedisClientMock).toHaveBeenCalledTimes(1);
  });
});
