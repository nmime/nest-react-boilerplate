import type { Db } from 'mongodb';
import {
  assertCollectionExists,
  assertIndex,
  ensureCollection,
  ensureIndex,
  type MongoMigration,
} from './mongo-migration';

const collectionName = 'fastify_sessions';

export const Migration20260726000100CreateCanonicalSessions: MongoMigration = {
  id: '20260726000100_create_canonical_sessions',
  name: 'CreateCanonicalSessions',

  async up(database: Db): Promise<void> {
    await ensureCollection(database, collectionName);
    const collection = database.collection(collectionName);
    await ensureIndex(collection, { sid: 1 }, { name: 'ux__fastify_sessions__sid', unique: true });
    await ensureIndex(collection, { expire: 1 }, { name: 'ix__fastify_sessions__expire', expireAfterSeconds: 0 });
  },

  async verify(database: Db): Promise<void> {
    await assertCollectionExists(database, collectionName);
    const collection = database.collection(collectionName);
    await assertIndex(collection, { sid: 1 }, { name: 'ux__fastify_sessions__sid', unique: true });
    await assertIndex(collection, { expire: 1 }, { name: 'ix__fastify_sessions__expire', expireAfterSeconds: 0 });
  },
};
