import type { Db } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { MongoMigration } from '../../../../shared/lib/src/migrations/mongo-migration';
import { initializePaymentsCollections, verifyPaymentsCollections } from '../payments-mongo.collection';

export const Migration20260823100000InitializePayments: MongoMigration = {
  id: '20260823100000_initialize_payments',
  name: 'InitializePayments',

  async up(database: Db): Promise<void> {
    await initializePaymentsCollections(database);
  },

  async verify(database: Db): Promise<void> {
    await verifyPaymentsCollections(database);
  },
};
