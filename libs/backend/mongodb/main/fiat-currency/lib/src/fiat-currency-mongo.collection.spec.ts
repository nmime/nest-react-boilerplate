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

  it('embeds localized names alongside the currency they belong to', () => {
    expect(FiatCurrencyCollectionValidator.$jsonSchema.properties.translations.bsonType).toBe('array');
    expect(FiatCurrencyCollectionValidator.$jsonSchema.required).toContain('translations');
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
