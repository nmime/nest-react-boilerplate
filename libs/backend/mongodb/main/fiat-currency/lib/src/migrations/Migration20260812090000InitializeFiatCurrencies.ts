import type { Db } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { MongoMigration } from '../../../../shared/lib/src/migrations/mongo-migration';
import { initializeFiatCurrencyCollections, verifyFiatCurrencyCollections } from '../fiat-currency-mongo.collection';

/**
 * Creates the fiat catalogue and its rate history.
 *
 * The timestamp matches the Postgres migration that creates the same three shapes, so the two axes
 * can be read side by side when one of them surprises somebody.
 */
export const Migration20260812090000InitializeFiatCurrencies: MongoMigration = {
  id: '20260812090000_initialize_fiat_currencies',
  name: 'InitializeFiatCurrencies',

  async up(database: Db): Promise<void> {
    await initializeFiatCurrencyCollections(database);
  },

  async verify(database: Db): Promise<void> {
    await verifyFiatCurrencyCollections(database);
  },
};
