import type { CreateIndexesOptions, Db, IndexDescription } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { assertCollectionDefinition } from '../../../shared/lib/src/migrations/mongo-migration';
import type { FiatCurrencyDocument, FiatCurrencyRateDocument } from './fiat-currency-mongo.types';

export const FiatCurrencyCollectionName = 'fiat_currencies';
export const FiatCurrencyRateCollectionName = 'fiat_currency_rates';
export const FiatCurrencyActiveIndexName = 'ix__fiat_currencies__active_display_order';
export const FiatCurrencyRateQuoteIndexName = 'uq__fiat_currency_rates__code_as_of_source';
export const FiatCurrencyRateHistoryIndexName = 'ix__fiat_currency_rates__code_as_of_desc';

const currencyCodePattern = '^[A-Z]{3}$';
// Mirrors the numeric(15,10) column on the Postgres axis: at most five integer digits and ten
// fractional ones, which is the widest rate the exact ratio arithmetic can still hold. A document
// store will accept any string, so the width has to be asserted here or the two axes drift.
const usdRatePattern = '^\\d{1,5}(\\.\\d{1,10})?$';

export const FiatCurrencyCollectionValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: [
      '_id',
      'minorUnitExponent',
      'symbol',
      'imageUrl',
      'active',
      'displayOrder',
      'usdPerUnit',
      'rateAsOf',
      'translations',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      _id: { bsonType: 'string', pattern: currencyCodePattern },
      minorUnitExponent: { bsonType: 'int', minimum: 0, maximum: 12 },
      symbol: { bsonType: 'string', minLength: 1, maxLength: 16 },
      imageUrl: { bsonType: ['string', 'null'] },
      active: { bsonType: 'bool' },
      displayOrder: { bsonType: 'int' },
      usdPerUnit: { bsonType: ['string', 'null'], pattern: usdRatePattern },
      rateAsOf: { bsonType: ['date', 'null'] },
      translations: {
        bsonType: 'array',
        items: {
          bsonType: 'object',
          additionalProperties: false,
          required: ['locale', 'name', 'symbol'],
          properties: {
            locale: { bsonType: 'string', minLength: 2, maxLength: 35 },
            name: { bsonType: 'string', minLength: 1, maxLength: 120 },
            symbol: { bsonType: ['string', 'null'], maxLength: 16 },
          },
        },
      },
      createdAt: { bsonType: 'date' },
      updatedAt: { bsonType: 'date' },
    },
  },
} as const;

export const FiatCurrencyRateCollectionValidator = {
  $jsonSchema: {
    bsonType: 'object',
    additionalProperties: false,
    required: ['_id', 'code', 'usdPerUnit', 'asOf', 'source', 'recordedAt'],
    properties: {
      _id: { bsonType: 'string' },
      code: { bsonType: 'string', pattern: currencyCodePattern },
      usdPerUnit: { bsonType: 'string', pattern: usdRatePattern },
      asOf: { bsonType: 'date' },
      source: { bsonType: 'string', minLength: 1, maxLength: 64 },
      recordedAt: { bsonType: 'date' },
    },
  },
} as const;

export const FiatCurrencyIndexes: Array<IndexDescription & CreateIndexesOptions> = [
  { name: FiatCurrencyActiveIndexName, key: { active: 1, displayOrder: 1, _id: 1 } },
];

export const FiatCurrencyRateIndexes: Array<IndexDescription & CreateIndexesOptions> = [
  { name: FiatCurrencyRateQuoteIndexName, key: { code: 1, asOf: 1, source: 1 }, unique: true },
  { name: FiatCurrencyRateHistoryIndexName, key: { code: 1, asOf: -1 } },
];

export async function initializeFiatCurrencyCollections(database: Db): Promise<void> {
  await defineCollection(database, FiatCurrencyCollectionName, FiatCurrencyCollectionValidator);
  await defineCollection(database, FiatCurrencyRateCollectionName, FiatCurrencyRateCollectionValidator);

  await database.collection<FiatCurrencyDocument>(FiatCurrencyCollectionName).createIndexes(FiatCurrencyIndexes);
  await database
    .collection<FiatCurrencyRateDocument>(FiatCurrencyRateCollectionName)
    .createIndexes(FiatCurrencyRateIndexes);
}

export async function verifyFiatCurrencyCollections(database: Db): Promise<void> {
  await assertCollectionDefinition(database, {
    name: FiatCurrencyCollectionName,
    validator: FiatCurrencyCollectionValidator,
    indexes: FiatCurrencyIndexes,
  });
  await assertCollectionDefinition(database, {
    name: FiatCurrencyRateCollectionName,
    validator: FiatCurrencyRateCollectionValidator,
    indexes: FiatCurrencyRateIndexes,
  });
}

async function defineCollection(database: Db, name: string, validator: object): Promise<void> {
  let existed = false;

  try {
    await database.createCollection(name, { validator, validationAction: 'error', validationLevel: 'strict' });
  } catch (error) {
    if (!isNamespaceExistsError(error)) {
      throw error;
    }
    existed = true;
  }

  if (existed) {
    await database.command({ collMod: name, validator, validationAction: 'error', validationLevel: 'strict' });
  }
}

function isNamespaceExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 48;
}
