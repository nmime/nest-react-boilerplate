import type { ClientSession, Collection, Db, Document } from 'mongodb';
import { ResultAsync } from 'neverthrow';
import type { AuthRepositoryError } from '@app/backend-feature-auth-shared';
import { AuthMongoCollections } from './auth-mongo.collections';

export interface MongoAuthDocument extends Document {
  _id: string;
  tenantId?: string;
}

export const repositoryResult = <T>(promise: Promise<T>): ResultAsync<T, AuthRepositoryError> =>
  ResultAsync.fromPromise(promise, (cause) => ({
    code: 'repository_error',
    message: cause instanceof Error ? cause.message : 'Auth persistence failed.',
  }));

export const sessionFrom = (value: unknown): ClientSession | undefined =>
  typeof value === 'object' && value !== null && 'startTransaction' in value ? (value as ClientSession) : undefined;

export const collection = (database: Db, name: string): Collection<MongoAuthDocument> =>
  database.collection<MongoAuthDocument>(name);

export const withoutId = <T extends { _id: string }>(document: T): Omit<T, '_id'> & { id: string } => {
  const { _id: id, ...rest } = document;
  return { ...rest, id };
};

export const pageLimit = (value?: number): number => Math.min(100, Math.max(1, value ?? 50));
export const pageOffset = (value?: number): number => Math.max(0, value ?? 0);

export async function serializeTenant(database: Db, tenantId: string, session: ClientSession): Promise<void> {
  await collection(database, AuthMongoCollections.tenantLocks).updateOne(
    { _id: tenantId },
    { $inc: { revision: 1 }, $set: { tenantId, updatedAt: new Date() }, $setOnInsert: { _id: tenantId } },
    { upsert: true, session },
  );
}
