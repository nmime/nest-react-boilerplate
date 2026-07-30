import type { ClientSession, MongoClient, TransactionOptions } from 'mongodb';
import {
  DefaultMongoCommitRetries,
  DefaultMongoTransactionRetries,
  MaximumMongoTransactionRetries,
  TransientTransactionErrorLabel,
  UnknownTransactionCommitResultLabel,
} from './mongo.constants';

export interface MongoTransactionRetryOptions {
  maxTransactionRetries?: number;
  maxCommitRetries?: number;
  maxCommitTimeMS?: number;
}

export type MongoTransactionHandler<T> = (session: ClientSession) => Promise<T>;

export async function runInMongoTransaction<T>(
  client: Pick<MongoClient, 'startSession'>,
  handler: MongoTransactionHandler<T>,
  options: MongoTransactionRetryOptions = {},
): Promise<T> {
  const maxTransactionRetries = boundedRetryCount(
    options.maxTransactionRetries,
    DefaultMongoTransactionRetries,
    'maxTransactionRetries',
  );
  const maxCommitRetries = boundedRetryCount(options.maxCommitRetries, DefaultMongoCommitRetries, 'maxCommitRetries');
  const transactionOptions = strictTransactionOptions(options.maxCommitTimeMS);
  const session = client.startSession();

  try {
    return await runTransactionAttempt(session, handler, transactionOptions, maxTransactionRetries, maxCommitRetries);
  } finally {
    await session.endSession();
  }
}

interface CommitRetryTransaction {
  error: unknown;
  retryTransaction: true;
}

async function runTransactionAttempt<T>(
  session: ClientSession,
  handler: MongoTransactionHandler<T>,
  transactionOptions: TransactionOptions,
  remainingTransactionRetries: number,
  maxCommitRetries: number,
): Promise<T> {
  session.startTransaction(transactionOptions);
  let result: T;
  try {
    result = await handler(session);
  } catch (error) {
    await abortActiveTransaction(session);
    if (hasMongoErrorLabel(error, TransientTransactionErrorLabel) && remainingTransactionRetries > 0) {
      return runTransactionAttempt(
        session,
        handler,
        transactionOptions,
        remainingTransactionRetries - 1,
        maxCommitRetries,
      );
    }
    throw error;
  }

  const commitResult = await commitTransaction(session, maxCommitRetries);
  if (commitResult === undefined) {
    return result;
  }
  if (remainingTransactionRetries <= 0) {
    throw commitResult.error;
  }

  await abortActiveTransaction(session);
  return runTransactionAttempt(session, handler, transactionOptions, remainingTransactionRetries - 1, maxCommitRetries);
}

async function commitTransaction(
  session: ClientSession,
  remainingCommitRetries: number,
): Promise<CommitRetryTransaction | undefined> {
  try {
    await session.commitTransaction();
    return undefined;
  } catch (error) {
    if (hasMongoErrorLabel(error, UnknownTransactionCommitResultLabel)) {
      if (remainingCommitRetries > 0) {
        return commitTransaction(session, remainingCommitRetries - 1);
      }
      throw error;
    }
    if (hasMongoErrorLabel(error, TransientTransactionErrorLabel)) {
      return { error, retryTransaction: true };
    }
    throw error;
  }
}

export function hasMongoErrorLabel(error: unknown, label: string): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const labelled = error as {
    errorLabels?: readonly string[] | ReadonlySet<string>;
    hasErrorLabel?: (candidate: string) => boolean;
  };
  if (typeof labelled.hasErrorLabel === 'function') {
    return labelled.hasErrorLabel(label);
  }
  if (Array.isArray(labelled.errorLabels)) {
    return labelled.errorLabels.includes(label);
  }

  return labelled.errorLabels instanceof Set && labelled.errorLabels.has(label);
}

function strictTransactionOptions(maxCommitTimeMS?: number): TransactionOptions {
  if (maxCommitTimeMS !== undefined && (!Number.isInteger(maxCommitTimeMS) || maxCommitTimeMS <= 0)) {
    throw new RangeError('maxCommitTimeMS must be a positive integer.');
  }

  return {
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
    readPreference: 'primary',
    ...(maxCommitTimeMS === undefined ? {} : { maxCommitTimeMS }),
  };
}

function boundedRetryCount(value: number | undefined, defaultValue: number, name: string): number {
  const retries = value ?? defaultValue;
  if (!Number.isInteger(retries) || retries < 0 || retries > MaximumMongoTransactionRetries) {
    throw new RangeError(`${name} must be an integer between 0 and ${MaximumMongoTransactionRetries}.`);
  }

  return retries;
}

async function abortActiveTransaction(session: ClientSession): Promise<void> {
  if (!session.inTransaction()) {
    return;
  }

  try {
    await session.abortTransaction();
  } catch {
    // Preserve the operation error that caused the transaction to abort.
  }
}
