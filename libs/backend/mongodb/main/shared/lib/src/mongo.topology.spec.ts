import type { MongoClient } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import {
  assertMongoTransactionTopology,
  MongoTransactionTopologyError,
  validateMongoTransactionTopology,
} from './mongo.topology';

const replicaSetHello = {
  isWritablePrimary: true,
  logicalSessionTimeoutMinutes: 30,
  maxWireVersion: 17,
  setName: 'rs0',
};

function expectTopologyError(action: () => unknown, code: MongoTransactionTopologyError['code']): void {
  try {
    action();
    throw new Error('Expected topology validation to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(MongoTransactionTopologyError);
    expect((error as MongoTransactionTopologyError).code).toBe(code);
  }
}

describe('MongoDB transaction topology validation', () => {
  it('accepts a writable transaction-capable replica set', () => {
    expect(validateMongoTransactionTopology(replicaSetHello, 'rs0')).toEqual({
      kind: 'replica_set',
      maxWireVersion: 17,
      replicaSetName: 'rs0',
    });
    expect(validateMongoTransactionTopology({ ...replicaSetHello, isWritablePrimary: false, ismaster: true })).toEqual(
      expect.objectContaining({ kind: 'replica_set' }),
    );
  });

  it('always rejects mongos because integrated support is replica-set-only', () => {
    const hello = { msg: 'isdbgrid', logicalSessionTimeoutMinutes: 30, maxWireVersion: 17 };
    expectTopologyError(() => validateMongoTransactionTopology(hello), 'sharded_not_allowed');
    expectTopologyError(() => validateMongoTransactionTopology(hello, 'rs0'), 'sharded_not_allowed');
    expectTopologyError(() => validateMongoTransactionTopology({ msg: 'isdbgrid' }), 'sharded_not_allowed');
  });

  it('always rejects standalone MongoDB', () => {
    expectTopologyError(
      () => validateMongoTransactionTopology({ logicalSessionTimeoutMinutes: 30, maxWireVersion: 17 }),
      'standalone_not_allowed',
    );
    expectTopologyError(
      () =>
        validateMongoTransactionTopology({
          ...replicaSetHello,
          setName: '   ',
        }),
      'standalone_not_allowed',
    );
  });

  it('requires logical sessions, a matching set, and a writable primary', () => {
    expectTopologyError(
      () => validateMongoTransactionTopology({ ...replicaSetHello, logicalSessionTimeoutMinutes: undefined }),
      'logical_sessions_unavailable',
    );
    expectTopologyError(
      () => validateMongoTransactionTopology({ ...replicaSetHello, logicalSessionTimeoutMinutes: 0 }),
      'logical_sessions_unavailable',
    );
    expectTopologyError(() => validateMongoTransactionTopology(replicaSetHello, 'other'), 'replica_set_mismatch');
    expectTopologyError(
      () => validateMongoTransactionTopology({ ...replicaSetHello, isWritablePrimary: false }),
      'primary_unavailable',
    );
  });

  it('enforces the replica-set transaction wire version', () => {
    expectTopologyError(
      () => validateMongoTransactionTopology({ ...replicaSetHello, maxWireVersion: 6 }),
      'wire_version_unsupported',
    );
    expectTopologyError(
      () => validateMongoTransactionTopology({ ...replicaSetHello, maxWireVersion: 7.5 }),
      'wire_version_unsupported',
    );
    expectTopologyError(
      () => validateMongoTransactionTopology({ ...replicaSetHello, logicalSessionTimeoutMinutes: Number.NaN }),
      'logical_sessions_unavailable',
    );
  });

  it('reads hello from the admin database', async () => {
    const command = vi.fn().mockResolvedValue(replicaSetHello);
    const db = vi.fn(() => ({ command }));
    await expect(assertMongoTransactionTopology({ db } as unknown as Pick<MongoClient, 'db'>, 'rs0')).resolves.toEqual(
      expect.objectContaining({ kind: 'replica_set' }),
    );
    expect(db).toHaveBeenCalledWith('admin');
    expect(command).toHaveBeenCalledWith({ hello: 1 });
  });
});
