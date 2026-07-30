import type { Db } from 'mongodb';
import {
  assertCollectionExists,
  assertIndex,
  ensureCollection,
  ensureIndex,
  type MongoMigration,
} from './mongo-migration';

/* eslint-disable no-await-in-loop -- Collection and index DDL is intentionally applied one step at a time. */

const collectionNames = ['user', 'session', 'account', 'verification'] as const;

const indexes = [
  { collection: 'user', keys: { email: 1 }, options: { name: 'uq__user__email', unique: true } },
  { collection: 'session', keys: { token: 1 }, options: { name: 'uq__session__token', unique: true } },
  { collection: 'session', keys: { userId: 1 }, options: { name: 'ix__session__userId' } },
  {
    collection: 'session',
    keys: { expiresAt: 1 },
    options: { name: 'ttl__session__expiresAt', expireAfterSeconds: 0 },
  },
  {
    collection: 'account',
    keys: { providerId: 1, accountId: 1 },
    options: { name: 'uq__account__provider_account', unique: true },
  },
  { collection: 'account', keys: { userId: 1 }, options: { name: 'ix__account__userId' } },
  {
    collection: 'verification',
    keys: { identifier: 1 },
    options: { name: 'ix__verification__identifier' },
  },
  {
    collection: 'verification',
    keys: { expiresAt: 1 },
    options: { name: 'ttl__verification__expiresAt', expireAfterSeconds: 0 },
  },
] as const;

export const Migration20260726000000CreateBetterAuthCollections: MongoMigration = {
  id: '20260726000000_create_better_auth_collections',
  name: 'CreateBetterAuthCollections',

  async up(database: Db): Promise<void> {
    for (const collectionName of collectionNames) {
      await ensureCollection(database, collectionName);
    }
    for (const index of indexes) {
      await ensureIndex(database.collection(index.collection), index.keys, index.options);
    }
  },

  async verify(database: Db): Promise<void> {
    for (const collectionName of collectionNames) {
      await assertCollectionExists(database, collectionName);
    }
    for (const index of indexes) {
      await assertIndex(database.collection(index.collection), index.keys, index.options);
    }
  },
};
