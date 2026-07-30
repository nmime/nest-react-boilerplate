import type { Db } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { MongoMigration } from '../../../../shared/lib/src/migrations/mongo-migration';
import { initializeFeatureFlagCollection, verifyFeatureFlagCollection } from '../feature-flag-mongo.collection';

export const Migration20260726000300InitializeFeatureFlags: MongoMigration = {
  id: '20260726000300_initialize_feature_flags',
  name: 'InitializeFeatureFlags',

  async up(database: Db): Promise<void> {
    await initializeFeatureFlagCollection(database);
  },

  async verify(database: Db): Promise<void> {
    await verifyFeatureFlagCollection(database);
  },
};
