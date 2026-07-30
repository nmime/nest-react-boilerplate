// @requirements REQ-RUNTIME-DATABASE-008
import type { Provider } from '@nestjs/common';
import { DurableDatabaseRuntimeInjectToken, type BackendSessionStoreOptions } from '@app/backend-common-bootstrap';
import { MongoClient, type Db, type MongoClientOptions } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

const migrationMocks = vi.hoisted(() => ({
  verifyAppliedMongoMigrations: vi.fn(() => Promise.resolve()),
}));
const sessionStoreMocks = vi.hoisted(() => ({
  close: vi.fn(() => Promise.resolve()),
  constructor: vi.fn(),
}));

vi.mock('./migrations/mongo-migration', async (importOriginal) => {
  const original = await importOriginal<typeof import('./migrations/mongo-migration')>();
  return { ...original, verifyAppliedMongoMigrations: migrationMocks.verifyAppliedMongoMigrations };
});
vi.mock('./mongo-session.store', () => ({
  MongoSessionStore: class MongoSessionStoreMock {
    constructor(env: NodeJS.ProcessEnv, defaultMaxAgeSeconds: number) {
      sessionStoreMocks.constructor(env, defaultMaxAgeSeconds);
    }

    close(): Promise<void> {
      return sessionStoreMocks.close();
    }
  },
}));

import { MongoClientToken, MongoDatabaseToken, MongoHealthOptionsToken } from './mongo.constants';
import { MongoMigrationReadinessHealthIndicator } from './mongo.health';
import { MongoDatabaseConfigService } from './mongo.config';
import {
  connectTransactionReadyMongoClient,
  MongoClientLifecycle,
  MongoMainModule,
  MongoSharedMigrationVerifier,
  nativeMongoClientFactory,
  type MongoClientFactory,
} from './mongo.module';
import { MongoSessionStore } from './mongo-session.store';
import { sharedMongoMigrations } from './migrations';

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

  it('verifies shared migrations during module initialization', async () => {
    const database = {} as Db;
    await new MongoSharedMigrationVerifier(database).onModuleInit();
    expect(migrationMocks.verifyAppliedMongoMigrations).toHaveBeenCalledWith(database, sharedMongoMigrations);
  });

  it('composes the durable runtime and creates the MongoDB session store', async () => {
    const providers = MongoMainModule.forRoot({ env }).providers ?? [];
    const runtimeTokenProvider = recordProvider(providers, DurableDatabaseRuntimeInjectToken);
    type RuntimeUnderTest = {
      readonly healthIndicators: readonly unknown[];
      readonly provider: string;
      createSessionStore(options: BackendSessionStoreOptions): MongoSessionStore;
      onModuleInit(): void;
    };
    const Runtime = runtimeTokenProvider.useExisting as new (...indicators: unknown[]) => RuntimeUnderTest;
    const indicators = [{ name: 'readiness' }, { name: 'transactions' }, { name: 'migrations' }];
    const runtime = new Runtime(...indicators);
    const previousDatabaseEngine = process.env.DATABASE_ENGINE;
    const previousAuthPersistence = process.env.AUTH_PERSISTENCE;

    try {
      process.env.DATABASE_ENGINE = 'mongodb';
      process.env.AUTH_PERSISTENCE = 'mongodb';
      expect(() => {
        runtime.onModuleInit();
      }).not.toThrow();
      expect(runtime.provider).toBe('mongodb');
      expect(runtime.healthIndicators).toEqual(indicators);

      const store = runtime.createSessionStore({
        defaultMaxAgeSeconds: 3600,
        env,
        sweepIntervalMs: 60_000,
      });
      expect(store).toBeInstanceOf(MongoSessionStore);
      expect(sessionStoreMocks.constructor).toHaveBeenCalledWith(env, 3600);
      await store.close();
    } finally {
      if (previousDatabaseEngine === undefined) {
        delete process.env.DATABASE_ENGINE;
      } else {
        process.env.DATABASE_ENGINE = previousDatabaseEngine;
      }
      if (previousAuthPersistence === undefined) {
        delete process.env.AUTH_PERSISTENCE;
      } else {
        process.env.AUTH_PERSISTENCE = previousAuthPersistence;
      }
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
