// @requirements REQ-FIAT-HISTORY-003
import type { Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import {
  FiatCurrencyCollectionName,
  FiatCurrencyCollectionValidator,
  FiatCurrencyIndexes,
  FiatCurrencyRateCollectionName,
  FiatCurrencyRateCollectionValidator,
  FiatCurrencyRateIndexes,
  initializeFiatCurrencyCollections,
  verifyFiatCurrencyCollections,
} from './fiat-currency-mongo.collection';

function createDatabase() {
  const createIndexes = vi.fn().mockResolvedValue([]);
  const createCollection = vi.fn().mockResolvedValue(undefined);
  const command = vi.fn().mockResolvedValue({ ok: 1 });
  const listIndexes = vi.fn((name?: string) => ({
    toArray: () => Promise.resolve(name === FiatCurrencyCollectionName ? FiatCurrencyIndexes : FiatCurrencyRateIndexes),
  }));
  const collection = vi.fn((name: string) => ({
    createIndexes,
    listIndexes: () => listIndexes(name),
  }));
  const listCollections = vi.fn((filter: { name?: string }) => ({
    toArray: () =>
      Promise.resolve([
        {
          name: filter.name,
          options: {
            validator:
              filter.name === FiatCurrencyCollectionName
                ? FiatCurrencyCollectionValidator
                : FiatCurrencyRateCollectionValidator,
            validationAction: 'error',
            validationLevel: 'strict',
          },
        },
      ]),
  }));
  const database = { createCollection, command, collection, listCollections } as unknown as Db;

  return { createCollection, command, createIndexes, collection, database };
}

describe('fiat currency collections', () => {
  it('constrains a stored rate to the width the exact arithmetic can hold', () => {
    const usdPerUnit = FiatCurrencyCollectionValidator.$jsonSchema.properties.usdPerUnit.pattern;

    expect(new RegExp(usdPerUnit, 'u').test('1.0812345678')).toBe(true);
    expect(new RegExp(usdPerUnit, 'u').test('1.08123456789')).toBe(false);
    expect(new RegExp(usdPerUnit, 'u').test('-1.08')).toBe(false);
  });

  it('carries the localized name and symbol as one object on the currency', () => {
    const { properties, required } = FiatCurrencyCollectionValidator.$jsonSchema;

    expect(properties.name.bsonType).toBe('object');
    expect(properties.symbol.bsonType).toBe('object');
    expect(required).toContain('name');
    expect(required).toContain('symbol');
  });

  it('has no embedded array of names for the two axes to disagree over', () => {
    // The Postgres axis stores one jsonb column. An array of `{locale, name}` here would be a
    // different shape reaching the same port, and the difference would surface as a bug in
    // whichever axis a product happened not to run its tests against.
    expect(FiatCurrencyCollectionValidator.$jsonSchema.required).not.toContain('translations');
    expect(JSON.stringify(FiatCurrencyCollectionValidator)).not.toContain('translations');
  });

  it('requires every value in a locale map to be a string', () => {
    // A document store will take `{"en": 42}` without complaint. The validator is the only thing
    // standing between that and a reader handing a number to the localization resolver.
    expect(FiatCurrencyCollectionValidator.$jsonSchema.properties.name.additionalProperties).toMatchObject({
      bsonType: 'string',
    });
    expect(FiatCurrencyCollectionValidator.$jsonSchema.properties.symbol.additionalProperties).toMatchObject({
      bsonType: 'string',
    });
  });

  it('accepts one quote per source and instant', () => {
    expect(FiatCurrencyRateIndexes).toContainEqual(
      expect.objectContaining({ key: { code: 1, asOf: 1, source: 1 }, unique: true }),
    );
  });

  it('creates both collections with strict validation and their indexes', async () => {
    const { createCollection, createIndexes, database } = createDatabase();

    await initializeFiatCurrencyCollections(database);

    expect(createCollection).toHaveBeenCalledWith(FiatCurrencyCollectionName, {
      validator: FiatCurrencyCollectionValidator,
      validationAction: 'error',
      validationLevel: 'strict',
    });
    expect(createCollection).toHaveBeenCalledWith(FiatCurrencyRateCollectionName, expect.anything());
    expect(createIndexes).toHaveBeenCalledWith(FiatCurrencyIndexes);
    expect(createIndexes).toHaveBeenCalledWith(FiatCurrencyRateIndexes);
  });

  it('applies the validator to a collection that already exists', async () => {
    const { createCollection, command, database } = createDatabase();
    createCollection.mockRejectedValue(Object.assign(new Error('exists'), { code: 48 }));

    await initializeFiatCurrencyCollections(database);

    expect(command).toHaveBeenCalledWith(expect.objectContaining({ collMod: FiatCurrencyCollectionName }));
  });

  it('surfaces a failure that is not a collection already existing', async () => {
    const { createCollection, database } = createDatabase();
    createCollection.mockRejectedValue(Object.assign(new Error('no permission'), { code: 13 }));

    await expect(initializeFiatCurrencyCollections(database)).rejects.toThrow('no permission');
  });

  it('verifies both collections against their declared shape', async () => {
    const { database } = createDatabase();

    await expect(verifyFiatCurrencyCollections(database)).resolves.toBeUndefined();
  });
});
