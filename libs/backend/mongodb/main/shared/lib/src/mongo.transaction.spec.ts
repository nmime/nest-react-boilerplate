// @requirements REQ-RUNTIME-DATABASE-008
import type { ClientSession, MongoClient, TransactionOptions } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { hasMongoErrorLabel, runInMongoTransaction, type MongoTransactionRetryOptions } from './mongo.transaction';
import { TransientTransactionErrorLabel, UnknownTransactionCommitResultLabel } from './mongo.constants';

interface SessionStub {
  session: ClientSession;
  abortTransaction: ReturnType<typeof vi.fn>;
  commitTransaction: ReturnType<typeof vi.fn>;
  endSession: ReturnType<typeof vi.fn>;
  inTransaction: ReturnType<typeof vi.fn>;
  startTransaction: ReturnType<typeof vi.fn>;
}

function sessionStub(): SessionStub {
  const startTransaction = vi.fn<(options?: TransactionOptions) => void>();
  const commitTransaction = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const abortTransaction = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const endSession = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const inTransaction = vi.fn<() => boolean>().mockReturnValue(true);
  return {
    session: {
      startTransaction,
      commitTransaction,
      abortTransaction,
      endSession,
      inTransaction,
    } as unknown as ClientSession,
    startTransaction,
    commitTransaction,
    abortTransaction,
    endSession,
    inTransaction,
  };
}

function clientFor(stub: SessionStub): Pick<MongoClient, 'startSession'> {
  return { startSession: vi.fn(() => stub.session) } as unknown as Pick<MongoClient, 'startSession'>;
}

function labelledError(label: string): Error & { hasErrorLabel(candidate: string): boolean } {
  return Object.assign(new Error(label), { hasErrorLabel: (candidate: string) => candidate === label });
}

describe('runInMongoTransaction', () => {
  it('commits with snapshot reads, majority writes, and primary read preference', async () => {
    const stub = sessionStub();
    await expect(
      runInMongoTransaction(clientFor(stub), async (session) => ({ sameSession: session === stub.session }), {
        maxCommitTimeMS: 1500,
      }),
    ).resolves.toEqual({ sameSession: true });
    expect(stub.startTransaction).toHaveBeenCalledWith({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
      maxCommitTimeMS: 1500,
    });
    expect(stub.commitTransaction).toHaveBeenCalledOnce();
    expect(stub.endSession).toHaveBeenCalledOnce();
  });

  it('retries the whole transaction for a transient body failure', async () => {
    const stub = sessionStub();
    const handler = vi
      .fn<(session: ClientSession) => Promise<string>>()
      .mockRejectedValueOnce(labelledError(TransientTransactionErrorLabel))
      .mockResolvedValue('committed');

    await expect(runInMongoTransaction(clientFor(stub), handler)).resolves.toBe('committed');
    expect(handler).toHaveBeenCalledTimes(2);
    expect(stub.startTransaction).toHaveBeenCalledTimes(2);
    expect(stub.abortTransaction).toHaveBeenCalledOnce();
  });

  it('retries an unknown commit result without rerunning the transaction body', async () => {
    const stub = sessionStub();
    stub.commitTransaction
      .mockRejectedValueOnce(labelledError(UnknownTransactionCommitResultLabel))
      .mockResolvedValue(undefined);
    const handler = vi.fn(async () => 'committed');

    await expect(runInMongoTransaction(clientFor(stub), handler)).resolves.toBe('committed');
    expect(handler).toHaveBeenCalledOnce();
    expect(stub.commitTransaction).toHaveBeenCalledTimes(2);
  });

  it('retries the whole transaction for a transient commit failure', async () => {
    const stub = sessionStub();
    stub.commitTransaction
      .mockRejectedValueOnce(labelledError(TransientTransactionErrorLabel))
      .mockResolvedValue(undefined);
    const handler = vi.fn(async () => 'committed');

    await expect(runInMongoTransaction(clientFor(stub), handler)).resolves.toBe('committed');
    expect(handler).toHaveBeenCalledTimes(2);
    expect(stub.abortTransaction).toHaveBeenCalledOnce();
  });

  it('does not retry a transient commit when transaction retries are disabled', async () => {
    const stub = sessionStub();
    const commitError = labelledError(TransientTransactionErrorLabel);
    stub.commitTransaction.mockRejectedValue(commitError);

    await expect(
      runInMongoTransaction(clientFor(stub), () => Promise.resolve('value'), { maxTransactionRetries: 0 }),
    ).rejects.toBe(commitError);
    expect(stub.startTransaction).toHaveBeenCalledOnce();
  });

  it('stops at configured transaction and commit retry bounds', async () => {
    const bodyStub = sessionStub();
    const bodyError = labelledError(TransientTransactionErrorLabel);
    await expect(
      runInMongoTransaction(clientFor(bodyStub), () => Promise.reject(bodyError), { maxTransactionRetries: 1 }),
    ).rejects.toBe(bodyError);
    expect(bodyStub.startTransaction).toHaveBeenCalledTimes(2);
    expect(bodyStub.endSession).toHaveBeenCalledOnce();

    const commitStub = sessionStub();
    const commitError = labelledError(UnknownTransactionCommitResultLabel);
    commitStub.commitTransaction.mockRejectedValue(commitError);
    await expect(
      runInMongoTransaction(clientFor(commitStub), () => Promise.resolve('value'), { maxCommitRetries: 1 }),
    ).rejects.toBe(commitError);
    expect(commitStub.commitTransaction).toHaveBeenCalledTimes(2);
    expect(commitStub.startTransaction).toHaveBeenCalledOnce();
  });

  it('does not retry ordinary body or commit failures', async () => {
    const bodyStub = sessionStub();
    bodyStub.inTransaction.mockReturnValue(false);
    const bodyError = new Error('body');
    await expect(runInMongoTransaction(clientFor(bodyStub), () => Promise.reject(bodyError))).rejects.toBe(bodyError);
    expect(bodyStub.abortTransaction).not.toHaveBeenCalled();

    const commitStub = sessionStub();
    const commitError = new Error('commit');
    commitStub.commitTransaction.mockRejectedValue(commitError);
    await expect(runInMongoTransaction(clientFor(commitStub), () => Promise.resolve('value'))).rejects.toBe(
      commitError,
    );
    expect(commitStub.endSession).toHaveBeenCalledOnce();
  });

  it('preserves the original failure when abort itself fails', async () => {
    const stub = sessionStub();
    stub.abortTransaction.mockRejectedValue(new Error('abort failed'));
    const original = new Error('operation failed');
    await expect(runInMongoTransaction(clientFor(stub), () => Promise.reject(original))).rejects.toBe(original);
  });

  it.each([
    [{ maxTransactionRetries: -1 }, 'maxTransactionRetries'],
    [{ maxTransactionRetries: 11 }, 'maxTransactionRetries'],
    [{ maxCommitRetries: 1.5 }, 'maxCommitRetries'],
    [{ maxCommitTimeMS: 0 }, 'maxCommitTimeMS'],
  ] satisfies [MongoTransactionRetryOptions, string][])('rejects invalid bounded option %o', async (options, name) => {
    const stub = sessionStub();
    await expect(runInMongoTransaction(clientFor(stub), () => Promise.resolve('value'), options)).rejects.toThrow(name);
    expect(stub.startTransaction).not.toHaveBeenCalled();
  });
});

describe('hasMongoErrorLabel', () => {
  it('supports driver methods, arrays, and sets without accepting unrelated values', () => {
    expect(hasMongoErrorLabel(labelledError('label'), 'label')).toBe(true);
    expect(hasMongoErrorLabel({ errorLabels: ['label'] }, 'label')).toBe(true);
    expect(hasMongoErrorLabel({ errorLabels: new Set(['label']) }, 'label')).toBe(true);
    expect(hasMongoErrorLabel({ errorLabels: ['other'] }, 'label')).toBe(false);
    expect(hasMongoErrorLabel({ errorLabels: {} }, 'label')).toBe(false);
    expect(hasMongoErrorLabel(null, 'label')).toBe(false);
    expect(hasMongoErrorLabel('label', 'label')).toBe(false);
  });
});
