// @requirements REQ-FIAT-HISTORY-003
import type { Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { FiatCurrencyCollectionName, FiatCurrencyRateCollectionName } from './fiat-currency-mongo.collection';
import { FiatCurrencyMongoPersistence } from './fiat-currency-mongo.repository';
import type { FiatCurrencyDocument } from './fiat-currency-mongo.types';

const now = new Date('2026-08-12T00:00:00.000Z');

function euroDocument(overrides: Partial<FiatCurrencyDocument> = {}): FiatCurrencyDocument {
  return {
    _id: 'EUR',
    minorUnitExponent: 2,
    name: { en: 'Euro', ru: 'Евро' },
    symbol: { default: '€' },
    imageUrl: null,
    active: true,
    displayOrder: 0,
    usdPerUnit: null,
    rateAsOf: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// The driver's cursor is a chain, and building it inline nests a function per link deep enough to
// bury what the test is actually saying.
function rateCursor(documents: unknown[] = []) {
  const toArray = (): Promise<unknown[]> => Promise.resolve(documents);
  const limit = (_count?: number) => ({ toArray });
  const sort = (_order?: unknown) => ({ limit });

  return { sort };
}

function createRepository() {
  const currencyFind = vi.fn((_filter?: unknown, _options?: unknown) => ({
    toArray: () => Promise.resolve<FiatCurrencyDocument[]>([]),
  }));
  const currencyFindOne = vi.fn((_filter: unknown) => Promise.resolve<FiatCurrencyDocument | null>(null));
  const currencyUpdateOne = vi.fn((_filter: unknown, _update: unknown, _options?: unknown) =>
    Promise.resolve({ matchedCount: 1 }),
  );
  const rateFind = vi.fn((_filter: unknown) => rateCursor());
  const rateUpdateOne = vi.fn((_filter: unknown, _update: unknown, _options?: unknown) =>
    Promise.resolve({ upsertedCount: 1 }),
  );

  const collections: Record<string, unknown> = {
    [FiatCurrencyCollectionName]: {
      find: currencyFind,
      findOne: currencyFindOne,
      updateOne: currencyUpdateOne,
    },
    [FiatCurrencyRateCollectionName]: { find: rateFind, updateOne: rateUpdateOne },
  };
  const database = { collection: (name: string) => collections[name] } as unknown as Db;

  return {
    currencyFind,
    currencyFindOne,
    currencyUpdateOne,
    rateFind,
    rateUpdateOne,
    persistence: new FiatCurrencyMongoPersistence(database),
  };
}

describe('FiatCurrencyMongoPersistence', () => {
  it('lists the catalogue in operator order', async () => {
    const { currencyFind, persistence } = createRepository();
    currencyFind.mockReturnValue({ toArray: () => Promise.resolve([euroDocument()]) });

    const currencies = await persistence.listCurrencies({});

    expect(currencyFind).toHaveBeenCalledWith({}, { sort: { displayOrder: 1, _id: 1 } });
    expect(currencies).toEqual([
      {
        code: 'EUR',
        minorUnitExponent: 2,
        name: { en: 'Euro', ru: 'Евро' },
        symbol: { default: '€' },
        imageUrl: null,
        active: true,
        displayOrder: 0,
        usdPerUnit: null,
        rateAsOf: null,
      },
    ]);
  });

  it('narrows the catalogue to active currencies and named codes', async () => {
    const { currencyFind, persistence } = createRepository();

    await persistence.listCurrencies({ activeOnly: true, codes: ['EUR', 'GBP'] });

    expect(currencyFind).toHaveBeenCalledWith(
      { active: true, _id: { $in: ['EUR', 'GBP'] } },
      { sort: { displayOrder: 1, _id: 1 } },
    );
  });

  it('finds one currency, or nothing', async () => {
    const { currencyFindOne, persistence } = createRepository();

    expect(await persistence.findCurrency('EUR')).toBeNull();

    currencyFindOne.mockResolvedValue(euroDocument({ usdPerUnit: '1.08', rateAsOf: now }));
    expect(await persistence.findCurrency('EUR')).toMatchObject({ usdPerUnit: '1.08', rateAsOf: now });
  });

  it('creates a currency that is not in the catalogue yet', async () => {
    const { currencyUpdateOne, currencyFindOne, persistence } = createRepository();
    currencyFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce(euroDocument({ _id: 'JPY' }));

    await persistence.upsertCurrency({ code: 'JPY', name: { en: 'Japanese yen' }, symbol: { default: '¥' } });

    expect(currencyUpdateOne).toHaveBeenCalledWith(
      { _id: 'JPY' },
      expect.objectContaining({
        $set: expect.objectContaining({
          name: { en: 'Japanese yen' },
          symbol: { default: '¥' },
          minorUnitExponent: 0,
        }),
      }),
      { upsert: true },
    );
  });

  it('takes every field the operator states verbatim', async () => {
    const { persistence } = createRepository();

    const currency = await persistence.upsertCurrency({
      code: 'EUR',
      name: { en: 'Euro' },
      symbol: { default: '€' },
      minorUnitExponent: 3,
      active: false,
      displayOrder: 7,
      imageUrl: 'https://cdn.example/eur.svg',
    });

    expect(currency).toEqual({
      code: 'EUR',
      name: { en: 'Euro' },
      symbol: { default: '€' },
      minorUnitExponent: 3,
      active: false,
      displayOrder: 7,
      imageUrl: 'https://cdn.example/eur.svg',
      usdPerUnit: null,
      rateAsOf: null,
    });
  });

  it('leaves the image and its settings alone when the update does not mention them', async () => {
    const { currencyFindOne, persistence } = createRepository();
    currencyFindOne.mockResolvedValue(
      euroDocument({
        imageUrl: 'https://cdn.example/eur.svg',
        active: false,
        displayOrder: 4,
        usdPerUnit: '1.08',
        rateAsOf: now,
      }),
    );

    expect(await persistence.upsertCurrency({ code: 'EUR', name: { en: 'Euro' }, symbol: { default: '€' } })).toEqual({
      code: 'EUR',
      name: { en: 'Euro' },
      symbol: { default: '€' },
      minorUnitExponent: 2,
      active: false,
      displayOrder: 4,
      imageUrl: 'https://cdn.example/eur.svg',
      usdPerUnit: '1.08',
      rateAsOf: now,
    });
  });

  it('replaces the whole locale map rather than merging it into the stored document', async () => {
    // $set on the field itself, not a positional update into an array. The port promises a write
    // replaces the map, and both axes have to keep that promise or a product that switches axis
    // discovers it cannot delete a locale.
    const { currencyFindOne, currencyUpdateOne, persistence } = createRepository();
    currencyFindOne.mockResolvedValue(euroDocument({ name: { en: 'Euro', ru: 'Евро', default: 'Euro' } }));

    await persistence.upsertCurrency({ code: 'EUR', name: { en: 'Euro' }, symbol: { default: '€' } });

    const [, update] = currencyUpdateOne.mock.calls[0] ?? [];
    expect((update as { $set: { name: unknown } }).$set.name).toEqual({ en: 'Euro' });
  });

  it('retires a currency without deleting its history', async () => {
    const { currencyUpdateOne, persistence } = createRepository();

    expect(await persistence.deactivateCurrency('EUR')).toBe(true);
    expect(currencyUpdateOne).toHaveBeenCalledWith(
      { _id: 'EUR' },
      { $set: { active: false, updatedAt: expect.any(Date) } },
    );
  });

  it('reports an unknown code rather than pretending it retired one', async () => {
    const { currencyUpdateOne, persistence } = createRepository();
    currencyUpdateOne.mockResolvedValue({ matchedCount: 0 });

    expect(await persistence.deactivateCurrency('ZZZ')).toBe(false);
  });

  it('appends a rate and advances the current rate', async () => {
    const { currencyFindOne, rateUpdateOne, currencyUpdateOne, persistence } = createRepository();
    currencyFindOne.mockResolvedValue(euroDocument());

    const recorded = await persistence.recordRates([{ code: 'EUR', usdPerUnit: '1.08', asOf: now, source: 'ecb' }]);

    expect(recorded).toEqual([{ code: 'EUR', usdPerUnit: '1.08', asOf: now, source: 'ecb' }]);
    expect(rateUpdateOne).toHaveBeenCalledWith(
      { code: 'EUR', asOf: now, source: 'ecb' },
      expect.objectContaining({ $setOnInsert: expect.objectContaining({ usdPerUnit: '1.08' }) }),
      { upsert: true },
    );
    expect(currencyUpdateOne).toHaveBeenCalledWith(
      { _id: 'EUR' },
      { $set: { usdPerUnit: '1.08', rateAsOf: now, updatedAt: expect.any(Date) } },
    );
  });

  it('keeps a late arrival in the history without moving the current rate backwards', async () => {
    const { currencyFindOne, rateUpdateOne, currencyUpdateOne, persistence } = createRepository();
    currencyFindOne.mockResolvedValue(euroDocument({ usdPerUnit: '1.09', rateAsOf: now }));

    await persistence.recordRates([
      { code: 'EUR', usdPerUnit: '1.08', asOf: new Date('2026-08-11T00:00:00.000Z'), source: 'ecb' },
    ]);

    expect(rateUpdateOne).toHaveBeenCalled();
    expect(currencyUpdateOne).not.toHaveBeenCalled();
  });

  it('refuses a rate the exact arithmetic cannot hold before it reaches the collection', async () => {
    const { persistence } = createRepository();

    await expect(
      persistence.recordRates([{ code: 'EUR', usdPerUnit: '-1', asOf: now, source: 'ecb' }]),
    ).rejects.toThrow(RangeError);
  });

  it('refuses a rate for a currency that is not in the catalogue', async () => {
    const { persistence } = createRepository();

    await expect(persistence.recordRates([{ code: 'ZZZ', usdPerUnit: '1', asOf: now, source: 'ecb' }])).rejects.toThrow(
      /ZZZ/u,
    );
  });

  it('reads rate history newest first within an optional window', async () => {
    const { rateFind, persistence } = createRepository();
    const sort = vi.fn(() => ({ limit: () => ({ toArray: () => Promise.resolve([]) }) }));
    rateFind.mockReturnValue({ sort });

    await persistence.listRateHistory({ code: 'EUR', since: now, until: now, limit: 50 });

    expect(rateFind).toHaveBeenCalledWith({ code: 'EUR', asOf: { $gte: now, $lt: now } });
    expect(sort).toHaveBeenCalledWith({ asOf: -1 });
  });

  it('reads unbounded history when no window is given', async () => {
    const { rateFind, persistence } = createRepository();
    rateFind.mockReturnValue(
      rateCursor([{ _id: 'x', code: 'EUR', usdPerUnit: '1.08', asOf: now, source: 'ecb', recordedAt: now }]),
    );

    expect(await persistence.listRateHistory({ code: 'EUR', limit: 10 })).toEqual([
      { code: 'EUR', usdPerUnit: '1.08', asOf: now, source: 'ecb' },
    ]);
    expect(rateFind).toHaveBeenCalledWith({ code: 'EUR' });
  });
});
