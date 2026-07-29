import type { Provider } from '@nestjs/common';
import { MongoClient, type Db, type MongoClientOptions } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { MongoClientToken, MongoDatabaseToken, MongoHealthOptionsToken } from './mongo.constants';
import { MongoMigrationReadinessHealthIndicator } from './mongo.health';
import { MongoDatabaseConfigService } from './mongo.config';
import {
  connectTransactionReadyMongoClient,
  MongoClientLifecycle,
  MongoMainModule,
  nativeMongoClientFactory,
  type MongoClientFactory,
} from './mongo.module';

const env = {
  MONGODB_URI: 'mongodb://mongo/app?replicaSet=rs0',
  MONGODB_DATABASE: 'app',
};

function clientStub(hello: Readonly<Record<string, unknown>> = transactionReadyHello()): {
  client: MongoClient;
  close: ReturnType<typeof vi.fn>;
  command: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  db: ReturnType<typeof vi.fn>;
} {
  const command = vi.fn().mockResolvedValue(hello);
  const db = vi.fn((name: string) => ({ name, command }) as unknown as Db);
  const connect = vi.fn<() => Promise<MongoClient>>();
  const close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const client = { connect, close, db } as unknown as MongoClient;
  connect.mockResolvedValue(client);
  return { client, close, command, connect, db };
}

function transactionReadyHello(): Record<string, unknown> {
  return {
    setName: 'rs0',
    isWritablePrimary: true,
    logicalSessionTimeoutMinutes: 30,
    maxWireVersion: 17,
  };
}

function recordProvider(providers: readonly Provider[], token: unknown): Record<string, unknown> {
  const provider = providers.find((candidate) => {
    const value: unknown = candidate;
    return isRecord(value) && value.provide === token;
  });
  if (provider === undefined) {
    throw new Error(`Provider ${String(token)} was not registered.`);
  }
  return provider as unknown as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

describe('connectTransactionReadyMongoClient', () => {
  it('connects, verifies topology, and returns the client with safe options', async () => {
    const stub = clientStub();
    const factory = vi.fn<MongoClientFactory>(() => stub.client);
    const config = new MongoDatabaseConfigService(env);

    await expect(connectTransactionReadyMongoClient(config, { maxPoolSize: 4 }, factory)).resolves.toBe(stub.client);
    expect(factory).toHaveBeenCalledWith(
      env.MONGODB_URI,
      expect.objectContaining({
        replicaSet: 'rs0',
        maxPoolSize: 4,
        retryWrites: true,
        writeConcern: { w: 'majority' },
      }),
    );
    expect(stub.connect).toHaveBeenCalledOnce();
    expect(stub.db).toHaveBeenCalledWith('admin');
  });

  it('closes and preserves initialization errors, including when close fails', async () => {
    const stub = clientStub({ logicalSessionTimeoutMinutes: 30, maxWireVersion: 17 });
    stub.close.mockRejectedValue(new Error('close failed'));
    const config = new MongoDatabaseConfigService(env);
    await expect(connectTransactionReadyMongoClient(config, {}, () => stub.client)).rejects.toThrow(
      'Standalone MongoDB',
    );
    expect(stub.close).toHaveBeenCalledOnce();
  });

  it('closes a client after failed topology validation', async () => {
    const stub = clientStub({ logicalSessionTimeoutMinutes: 30, maxWireVersion: 17 });
    const config = new MongoDatabaseConfigService(env);
    await expect(connectTransactionReadyMongoClient(config, {}, () => stub.client)).rejects.toThrow(
      'Standalone MongoDB',
    );
    expect(stub.close).toHaveBeenCalledOnce();
  });
});

describe('MongoMainModule', () => {
  it('registers and exports the shared client, database, config, and health providers', async () => {
    const stub = clientStub();
    const dynamicModule = MongoMainModule.forRoot({ env, clientFactory: () => stub.client });
    const providers = dynamicModule.providers ?? [];
    expect(dynamicModule.module).toBe(MongoMainModule);
    expect(dynamicModule.exports).toEqual(expect.arrayContaining([MongoClientToken, MongoDatabaseToken]));
    expect(dynamicModule.exports).toContain(MongoMigrationReadinessHealthIndicator);

    const clientProvider = recordProvider(providers, MongoClientToken);
    await expect((clientProvider.useFactory as () => Promise<MongoClient>)()).resolves.toBe(stub.client);

    const databaseProvider = recordProvider(providers, MongoDatabaseToken);
    const database = (databaseProvider.useFactory as (client: MongoClient) => Db)(stub.client);
    expect(database).toMatchObject({ name: 'app' });

    const configProvider = recordProvider(providers, MongoDatabaseConfigService);
    expect(configProvider.useValue).toBeInstanceOf(MongoDatabaseConfigService);

    const lifecycleProvider = recordProvider(providers, MongoClientLifecycle);
    expect((lifecycleProvider.useFactory as (client: MongoClient) => MongoClientLifecycle)(stub.client)).toBeInstanceOf(
      MongoClientLifecycle,
    );
  });

  it('uses default and explicit module health options', () => {
    const defaultProviders = MongoMainModule.forRoot({ env }).providers ?? [];
    expect(recordProvider(defaultProviders, MongoHealthOptionsToken).useValue).toEqual({});

    const health = { required: false, timeoutMs: 500 };
    const explicitProviders = MongoMainModule.forRoot({ env, health }).providers ?? [];
    expect(recordProvider(explicitProviders, MongoHealthOptionsToken).useValue).toBe(health);
  });

  it('reads process environment when called with default options', () => {
    const previous = process.env;
    process.env = { ...previous, ...env };
    try {
      expect(MongoMainModule.forRoot().module).toBe(MongoMainModule);
    } finally {
      process.env = previous;
    }
  });
});

describe('MongoClientLifecycle', () => {
  it('closes the client once across repeated shutdown notifications', async () => {
    const stub = clientStub();
    const lifecycle = new MongoClientLifecycle(stub.client);
    await lifecycle.onApplicationShutdown();
    await lifecycle.onApplicationShutdown();
    expect(stub.close).toHaveBeenCalledOnce();
  });
});

describe('MongoClientFactory typing', () => {
  it('constructs a native v7 client without connecting', () => {
    const factory: MongoClientFactory = nativeMongoClientFactory;
    const options: MongoClientOptions = { directConnection: false };
    const client = factory(env.MONGODB_URI, options);
    expect(client).toBeInstanceOf(MongoClient);
  });
});
