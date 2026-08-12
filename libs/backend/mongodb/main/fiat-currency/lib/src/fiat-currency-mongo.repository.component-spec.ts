// @requirements REQ-FIAT-HISTORY-003
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FiatCurrencyCollectionName,
  FiatCurrencyRateCollectionName,
  initializeFiatCurrencyCollections,
  verifyFiatCurrencyCollections,
} from './fiat-currency-mongo.collection';
import { FiatCurrencyMongoPersistence } from './fiat-currency-mongo.repository';
import type { FiatCurrencyDocument, FiatCurrencyRateDocument } from './fiat-currency-mongo.types';

const databaseName = 'fiat_currency_component';

describe('fiat currency persistence against MongoDB', () => {
  let container: StartedMongoDBContainer;
  let client: MongoClient;
  let persistence: FiatCurrencyMongoPersistence;

  beforeAll(async () => {
    container = await new MongoDBContainer('mongo:7.0.26-jammy').start();
    const connectionString = container.getConnectionString();
    const separator = connectionString.includes('?') ? '&' : '?';
    client = new MongoClient(`${connectionString}${separator}directConnection=true&replicaSet=rs0`);
    await client.connect();
    const database = client.db(databaseName);
    await initializeFiatCurrencyCollections(database);
    persistence = new FiatCurrencyMongoPersistence(database);
  });

  afterAll(async () => {
    await client.close();
    await container.stop();
  });

  it('installs collections the migration verifier then accepts unchanged', async () => {
    await expect(verifyFiatCurrencyCollections(client.db(databaseName))).resolves.toBeUndefined();

    // Re-running initialization is how an operator recovers a drifted validator; it must be a no-op
    // on a database that is already correct rather than a duplicate-collection failure.
    await initializeFiatCurrencyCollections(client.db(databaseName));
    await expect(verifyFiatCurrencyCollections(client.db(databaseName))).resolves.toBeUndefined();
  });

  it('keeps the headline rate and the newest history row in agreement across a late arrival', async () => {
    await persistence.upsertCurrency({
      code: 'EUR',
      name: { en: 'Euro', ru: 'Евро' },
      symbol: { default: '€' },
      displayOrder: 1,
    });

    const monday = new Date('2026-08-10T00:00:00.000Z');
    const tuesday = new Date('2026-08-11T00:00:00.000Z');
    await persistence.recordRates([{ code: 'EUR', usdPerUnit: '1.0800000000', asOf: tuesday, source: 'ecb' }]);
    await persistence.recordRates([{ code: 'EUR', usdPerUnit: '1.0700000000', asOf: monday, source: 'ecb' }]);

    const stored = await persistence.findCurrency('EUR');
    expect(stored).toMatchObject({ usdPerUnit: '1.0800000000', rateAsOf: tuesday, minorUnitExponent: 2 });

    const history = await persistence.listRateHistory({ code: 'EUR', limit: 10 });
    expect(history.map((rate) => rate.asOf)).toEqual([tuesday, monday]);
    expect(stored).toMatchObject({ name: { en: 'Euro', ru: 'Евро' }, symbol: { default: '€' } });
  });

  it('collapses a provider retry onto one history row through the unique index', async () => {
    await persistence.upsertCurrency({ code: 'GBP', name: { en: 'Pound sterling' }, symbol: { default: '£' } });

    const asOf = new Date('2026-08-11T12:00:00.000Z');
    await persistence.recordRates([{ code: 'GBP', usdPerUnit: '1.2700000000', asOf, source: 'ecb' }]);
    await persistence.recordRates([{ code: 'GBP', usdPerUnit: '1.2700000000', asOf, source: 'ecb' }]);
    expect(await persistence.listRateHistory({ code: 'GBP', limit: 10 })).toHaveLength(1);

    await persistence.recordRates([{ code: 'GBP', usdPerUnit: '1.2690000000', asOf, source: 'boe' }]);
    expect(await persistence.listRateHistory({ code: 'GBP', limit: 10 })).toHaveLength(2);

    await expect(
      client.db(databaseName).collection<FiatCurrencyRateDocument>(FiatCurrencyRateCollectionName).insertOne({
        _id: 'duplicate',
        code: 'GBP',
        usdPerUnit: '1.2700000000',
        asOf,
        source: 'ecb',
        recordedAt: new Date(),
      }),
    ).rejects.toThrow(/duplicate key/u);
  });

  it('refuses a rate for a currency the catalogue does not hold', async () => {
    await expect(
      persistence.recordRates([
        { code: 'XXX', usdPerUnit: '1.0000000000', asOf: new Date('2026-08-11T13:00:00.000Z'), source: 'ecb' },
      ]),
    ).rejects.toThrow('XXX is not in the fiat catalogue');
  });

  it('rejects a rate wider than the Postgres axis would hold, so the two cannot drift', async () => {
    await expect(
      client
        .db(databaseName)
        .collection<FiatCurrencyRateDocument>(FiatCurrencyRateCollectionName)
        .insertOne({
          _id: 'too-precise',
          code: 'EUR',
          usdPerUnit: '1.08000000001',
          asOf: new Date('2026-08-12T00:00:00.000Z'),
          source: 'ecb',
          recordedAt: new Date(),
        }),
    ).rejects.toThrow(/[Vv]alidation/u);
  });

  it('replaces the whole locale map, so a locale an operator drops stays dropped', async () => {
    await persistence.upsertCurrency({
      code: 'TRY',
      name: { en: 'Turkish lira', ru: 'Турецкая лира' },
      symbol: { default: '₺' },
      imageUrl: 'https://cdn.example.test/try.svg',
      displayOrder: 9,
    });
    await persistence.upsertCurrency({ code: 'TRY', name: { en: 'Turkish Lira' }, symbol: { default: '₺' } });

    expect(await persistence.listCurrencies({ codes: ['TRY'] })).toEqual([
      expect.objectContaining({
        code: 'TRY',
        name: { en: 'Turkish Lira' },
        imageUrl: 'https://cdn.example.test/try.svg',
        displayOrder: 9,
      }),
    ]);

    expect(await persistence.deactivateCurrency('TRY')).toBe(true);
    expect(await persistence.deactivateCurrency('XXX')).toBe(false);
    expect(await persistence.listCurrencies({ activeOnly: true, codes: ['TRY'] })).toEqual([]);
  });

  it('stores a currency the validator accepts, so the document shape and the port agree', async () => {
    const document = await client
      .db(databaseName)
      .collection<FiatCurrencyDocument>(FiatCurrencyCollectionName)
      .findOne({ _id: 'GBP' });

    expect(document).toMatchObject({
      _id: 'GBP',
      name: { en: 'Pound sterling' },
      symbol: { default: '£' },
      active: true,
      displayOrder: 0,
      imageUrl: null,
      minorUnitExponent: 2,
    });
  });

  it('refuses a locale map whose value is not a string', async () => {
    // The validator is the MongoDB axis's equivalent of the jsonb check constraint on the other
    // one. Without it the two axes would disagree about what the collection can hold.
    await expect(
      client
        .db(databaseName)
        .collection<FiatCurrencyDocument>(FiatCurrencyCollectionName)
        .updateOne({ _id: 'GBP' }, { $set: { name: { en: 42 } as unknown as FiatCurrencyDocument['name'] } }),
    ).rejects.toThrow(/[Vv]alidation/u);
  });
});
