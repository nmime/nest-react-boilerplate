// @requirements REQ-RUNTIME-DATABASE-008
import type { MongoClient } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';

const migrationMocks = vi.hoisted(() => ({
  verifyAppliedMongoMigrations: vi.fn(() => Promise.resolve()),
}));

vi.mock('./migrations/mongo-migration', async (importOriginal) => {
  const original = await importOriginal<typeof import('./migrations/mongo-migration')>();
  return { ...original, verifyAppliedMongoMigrations: migrationMocks.verifyAppliedMongoMigrations };
});

import { MongoDatabaseConfigService } from './mongo.config';
import {
  MongoReadinessHealthIndicator,
  MongoMigrationReadinessHealthIndicator,
  MongoTransactionReadinessHealthIndicator,
  NativeMongoHealthAdapter,
  type MongoDependencyHealthAdapter,
} from './mongo.health';
import { MongoTransactionTopologyError } from './mongo.topology';
import { sharedMongoMigrations } from './migrations';

const config = new MongoDatabaseConfigService({
  MONGODB_URI: 'mongodb://mongo/app?replicaSet=rs0',
  MONGODB_DATABASE: 'app',
});

function adapterStub(overrides: Partial<MongoDependencyHealthAdapter> = {}): MongoDependencyHealthAdapter {
  return {
    checkReadiness: vi.fn().mockResolvedValue(undefined),
    checkMigrationReadiness: vi.fn().mockResolvedValue(undefined),
    checkTransactionReadiness: vi.fn().mockResolvedValue({
      kind: 'replica_set',
      maxWireVersion: 17,
      replicaSetName: 'rs0',
    }),
    ...overrides,
  };
}

describe('MongoDB health adapter', () => {
  it('checks the configured database and strict topology', async () => {
    const pingCommand = vi.fn().mockResolvedValue({ ok: 1 });
    const helloCommand = vi.fn().mockResolvedValue({
      setName: 'rs0',
      isWritablePrimary: true,
      logicalSessionTimeoutMinutes: 30,
      maxWireVersion: 17,
    });
    const applicationDatabase = { command: pingCommand };
    const adminDatabase = { command: helloCommand };
    const db = vi.fn((name: string) => (name === 'admin' ? adminDatabase : applicationDatabase));
    const adapter = new NativeMongoHealthAdapter({ db } as unknown as MongoClient, config);

    await adapter.checkReadiness();
    await adapter.checkMigrationReadiness();
    await expect(adapter.checkTransactionReadiness()).resolves.toEqual(
      expect.objectContaining({ kind: 'replica_set' }),
    );
    expect(db).toHaveBeenCalledWith('app');
    expect(pingCommand).toHaveBeenCalledWith({ ping: 1 });
    expect(migrationMocks.verifyAppliedMongoMigrations).toHaveBeenCalledWith(
      applicationDatabase,
      sharedMongoMigrations,
    );
  });
});

describe('MongoDB health indicators', () => {
  it('reports connectivity and transaction topology successes', async () => {
    const adapter = adapterStub();
    await expect(new MongoReadinessHealthIndicator(adapter).check()).resolves.toEqual({
      name: 'mongodb',
      status: 'ok',
      required: true,
      details: { reachable: true },
    });
    await expect(new MongoMigrationReadinessHealthIndicator(adapter).check()).resolves.toEqual({
      name: 'mongodb-migrations',
      status: 'ok',
      required: true,
      details: { applied: true },
    });
    await expect(new MongoTransactionReadinessHealthIndicator(adapter).check()).resolves.toEqual({
      name: 'mongodb-transactions',
      status: 'ok',
      required: true,
      details: { transactionCapable: true, topology: 'replica_set' },
    });
  });

  it('uses custom names and degrades optional failed checks without exposing raw errors', async () => {
    const adapter = adapterStub({
      checkReadiness: vi.fn().mockRejectedValue('connection secret'),
      checkMigrationReadiness: vi.fn().mockRejectedValue(new Error('migration detail')),
      checkTransactionReadiness: vi
        .fn()
        .mockRejectedValue(new MongoTransactionTopologyError('standalone_not_allowed', 'internal topology detail')),
    });
    await expect(
      new MongoReadinessHealthIndicator(adapter, { required: false, readinessName: 'document-store' }).check(),
    ).resolves.toEqual({
      name: 'document-store',
      status: 'degraded',
      required: false,
      details: { message: 'MongoDB readiness check failed.' },
    });
    await expect(
      new MongoMigrationReadinessHealthIndicator(adapter, {
        required: false,
        migrationReadinessName: 'document-migrations',
      }).check(),
    ).resolves.toEqual({
      name: 'document-migrations',
      status: 'degraded',
      required: false,
      details: { message: 'MongoDB migration check failed.', type: 'Error' },
    });
    const transactionResult = await new MongoTransactionReadinessHealthIndicator(adapter, {
      required: false,
      transactionReadinessName: 'document-transactions',
    }).check();
    expect(transactionResult).toEqual({
      name: 'document-transactions',
      status: 'degraded',
      required: false,
      details: {
        message: 'MongoDB transaction readiness check failed.',
        reason: 'standalone_not_allowed',
        type: 'MongoTransactionTopologyError',
      },
    });
    expect(JSON.stringify(transactionResult)).not.toContain('internal topology detail');
  });

  it('reports required failures and enforces positive timeouts', async () => {
    const adapter = adapterStub({ checkReadiness: vi.fn().mockRejectedValue(new Error('unavailable')) });
    await expect(new MongoReadinessHealthIndicator(adapter).check()).resolves.toEqual({
      name: 'mongodb',
      status: 'error',
      required: true,
      details: { message: 'MongoDB readiness check failed.', type: 'Error' },
    });
    expect(() => new MongoReadinessHealthIndicator(adapter, { timeoutMs: 0 })).toThrow('positive integer');
    expect(() => new MongoTransactionReadinessHealthIndicator(adapter, { timeoutMs: 1.5 })).toThrow('positive integer');
    expect(() => new MongoMigrationReadinessHealthIndicator(adapter, { timeoutMs: -1 })).toThrow('positive integer');
  });

  it('bounds checks with a timeout', async () => {
    const adapter = adapterStub({ checkReadiness: () => new Promise(() => undefined) });
    await expect(new MongoReadinessHealthIndicator(adapter, { timeoutMs: 1 }).check()).resolves.toEqual(
      expect.objectContaining({ status: 'error' }),
    );
  });
});
