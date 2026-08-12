// @requirements REQ-FIAT-HISTORY-003
import type { Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { Migration20260812090000InitializeFiatCurrencies } from './Migration20260812090000InitializeFiatCurrencies';
import { fiatCurrencyMongoMigrations } from './index';

const collectionMocks = vi.hoisted(() => ({
  initializeFiatCurrencyCollections: vi.fn(() => Promise.resolve()),
  verifyFiatCurrencyCollections: vi.fn(() => Promise.resolve()),
}));

vi.mock('../fiat-currency-mongo.collection', async (importOriginal) => {
  const original = await importOriginal<typeof import('../fiat-currency-mongo.collection')>();
  return { ...original, ...collectionMocks };
});

describe('fiat currency MongoDB migration', () => {
  it('is registered under a sortable id that names what it does', () => {
    expect(fiatCurrencyMongoMigrations).toEqual([Migration20260812090000InitializeFiatCurrencies]);
    expect(Migration20260812090000InitializeFiatCurrencies.id).toBe('20260812090000_initialize_fiat_currencies');
  });

  it('creates both collections when it runs', async () => {
    const database = {} as Db;

    await Migration20260812090000InitializeFiatCurrencies.up(database);

    expect(collectionMocks.initializeFiatCurrencyCollections).toHaveBeenCalledWith(database);
  });

  it('re-checks the deployed shape rather than trusting the ledger', async () => {
    const database = {} as Db;

    await Migration20260812090000InitializeFiatCurrencies.verify?.(database);

    expect(collectionMocks.verifyFiatCurrencyCollections).toHaveBeenCalledWith(database);
  });
});
