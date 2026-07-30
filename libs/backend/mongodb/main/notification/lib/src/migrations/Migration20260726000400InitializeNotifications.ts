import type { Db } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { MongoMigration } from '../../../../shared/lib/src/migrations/mongo-migration';
import {
  initializeMongoNotificationPersistence,
  verifyMongoNotificationPersistence,
} from '../notification-mongo.collections';

export const Migration20260726000400InitializeNotifications: MongoMigration = {
  id: '20260726000400_initialize_notifications',
  name: 'InitializeNotifications',

  async up(database: Db): Promise<void> {
    await initializeMongoNotificationPersistence(database);
  },

  async verify(database: Db): Promise<void> {
    await verifyMongoNotificationPersistence(database);
  },
};
