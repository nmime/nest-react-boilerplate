import type { Db } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { MongoMigration } from '../../../../shared/lib/src/migrations/mongo-migration';
import { initializeMongoAuthPersistence, verifyMongoAuthPersistence } from '../auth-mongo.collections';

export const Migration20260726000200InitializeAuthPersistence: MongoMigration = {
  id: '20260726000200_initialize_auth_persistence',
  name: 'InitializeAuthPersistence',

  async up(database: Db): Promise<void> {
    await initializeMongoAuthPersistence(database);
  },

  async verify(database: Db): Promise<void> {
    await verifyMongoAuthPersistence(database);
  },
};
