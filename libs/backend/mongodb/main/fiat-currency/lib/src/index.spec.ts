// @requirements REQ-FIAT-HISTORY-003
import { describe, expect, it } from 'vitest';
import * as fiatCurrencyMongo from './index';

describe('MongoDB fiat currency public API', () => {
  it('exports the collections, the migration, the repository, and the module', () => {
    expect(fiatCurrencyMongo).toMatchObject({
      FiatCurrencyCollectionName: 'fiat_currencies',
      FiatCurrencyRateCollectionName: 'fiat_currency_rates',
      FiatCurrencyMongoMigrationVerifier: expect.any(Function),
      FiatCurrencyMongoModule: expect.any(Function),
      FiatCurrencyMongoPersistence: expect.any(Function),
      initializeFiatCurrencyCollections: expect.any(Function),
      fiatCurrencyMongoMigrations: expect.any(Array),
    });
  });
});
