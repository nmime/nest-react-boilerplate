// @requirements REQ-FIAT-HISTORY-003
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it, vi } from 'vitest';
import { FiatCurrencyEntity, FiatCurrencyRateEntity } from '../entities';
import { FiatCurrencyPostgresPersistence } from './fiat-currency.repository';

function createEntityManagerMock() {
  const persist = vi.fn(() => undefined);
  const remove = vi.fn(() => undefined);
  const flush = vi.fn(() => Promise.resolve());
  const findOne = vi.fn((_entity: unknown, _where?: unknown) => Promise.resolve<unknown>(null));
  const find = vi.fn((_entity: unknown, _where?: unknown, _options?: unknown) => Promise.resolve<unknown[]>([]));
  const entityManager = { persist, remove, flush, findOne, find } as unknown as EntityManager;
  const transactional = vi.fn((work: (fork: EntityManager) => Promise<unknown>) => work(entityManager));
  Object.assign(entityManager, { transactional });

  return { persist, remove, flush, findOne, find, transactional, entityManager };
}

const euro = (overrides: Partial<FiatCurrencyEntity> = {}): FiatCurrencyEntity =>
  Object.assign(
    new FiatCurrencyEntity({ code: 'EUR', name: { en: 'Euro', ru: 'Евро' }, symbol: { default: '€' } }),
    overrides,
  );

describe('FiatCurrencyPostgresPersistence', () => {
  it('lists the catalogue in operator order', async () => {
    const { find, entityManager } = createEntityManagerMock();
    find.mockResolvedValue([euro()]);
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    const currencies = await persistence.listCurrencies({});

    expect(find).toHaveBeenCalledWith(FiatCurrencyEntity, {}, { orderBy: { displayOrder: 'ASC', code: 'ASC' } });
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
    const { find, entityManager } = createEntityManagerMock();
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    await persistence.listCurrencies({ activeOnly: true, codes: ['EUR', 'GBP'] });

    expect(find).toHaveBeenCalledWith(
      FiatCurrencyEntity,
      { active: true, code: { $in: ['EUR', 'GBP'] } },
      { orderBy: { displayOrder: 'ASC', code: 'ASC' } },
    );
  });

  it('finds one currency, or nothing', async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    expect(await persistence.findCurrency('EUR')).toBeNull();

    findOne.mockResolvedValue(euro({ usdPerUnit: '1.0800000000' }));
    expect(await persistence.findCurrency('EUR')).toMatchObject({ code: 'EUR', usdPerUnit: '1.08' });
  });

  it('creates a currency that is not in the catalogue yet', async () => {
    const { findOne, persist, entityManager } = createEntityManagerMock();
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    const created = await persistence.upsertCurrency({
      code: 'JPY',
      name: { en: 'Japanese yen' },
      symbol: { default: '¥' },
    });

    expect(persist).toHaveBeenCalledWith(expect.any(FiatCurrencyEntity));
    expect(findOne).toHaveBeenCalledWith(FiatCurrencyEntity, { code: 'JPY' });
    expect(created).toMatchObject({ code: 'JPY', minorUnitExponent: 0, active: true });
  });

  it('updates only the fields an operator supplied', async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(euro({ displayOrder: 7, imageUrl: 'https://cdn.example.test/eur.svg' }));
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    const updated = await persistence.upsertCurrency({
      code: 'EUR',
      name: { en: 'Euro', ru: 'Евро' },
      symbol: { default: '€' },
      active: false,
    });

    expect(updated).toMatchObject({ active: false, displayOrder: 7, imageUrl: 'https://cdn.example.test/eur.svg' });
  });

  it('rejects a catalogue exponent that conflicts with exact money scaling', async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(euro({ imageUrl: 'https://cdn.example.test/old.svg' }));
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    await expect(
      persistence.upsertCurrency({
        code: 'EUR',
        name: { en: 'Euro' },
        symbol: { default: '€' },
        minorUnitExponent: 4,
        imageUrl: 'https://cdn.example.test/new.svg',
      }),
    ).rejects.toThrow(/must match the registered money exponent 2/u);
  });

  it('accepts an explicit image update when the money exponent remains canonical', async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(euro({ imageUrl: 'https://cdn.example.test/old.svg' }));
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    await expect(
      persistence.upsertCurrency({
        code: 'EUR',
        name: { en: 'Euro' },
        symbol: { default: '€' },
        minorUnitExponent: 2,
        imageUrl: 'https://cdn.example.test/new.svg',
      }),
    ).resolves.toMatchObject({ minorUnitExponent: 2, imageUrl: 'https://cdn.example.test/new.svg' });
  });

  it('replaces the whole locale map rather than merging into the stored one', async () => {
    // A merge would leave a locale nobody can delete: an editor who removes the Russian name and
    // saves would get it back on the next read. The map is one value, so a write is one value.
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(euro());
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    const updated = await persistence.upsertCurrency({
      code: 'EUR',
      name: { en: 'Euro' },
      symbol: { default: '€', ru: 'евро' },
    });

    expect(updated.name).toEqual({ en: 'Euro' });
    expect(updated.symbol).toEqual({ default: '€', ru: 'евро' });
  });

  it('writes a currency and its names without opening a transaction', async () => {
    // The names used to live in a second table, so the write needed one statement per locale and a
    // transaction to keep them in step with the currency. One row needs neither.
    const { findOne, transactional, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(euro());
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    await persistence.upsertCurrency({ code: 'EUR', name: { en: 'Euro' }, symbol: { default: '€' } });

    expect(transactional).not.toHaveBeenCalled();
  });

  it('retires a currency without deleting its history', async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    const currency = euro();
    findOne.mockResolvedValue(currency);
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    expect(await persistence.deactivateCurrency('EUR')).toBe(true);
    expect(currency.active).toBe(false);
  });

  it('reports an unknown code rather than pretending it retired one', async () => {
    const { entityManager } = createEntityManagerMock();
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    expect(await persistence.deactivateCurrency('ZZZ')).toBe(false);
  });

  it('appends a rate and advances the current rate', async () => {
    const { findOne, persist, entityManager } = createEntityManagerMock();
    const currency = euro();
    findOne.mockImplementation((entity: unknown) => Promise.resolve(entity === FiatCurrencyEntity ? currency : null));
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);
    const asOf = new Date('2026-08-12T00:00:00.000Z');

    const recorded = await persistence.recordRates([{ code: 'EUR', usdPerUnit: '1.08', asOf, source: 'ecb' }]);

    expect(recorded).toEqual([{ code: 'EUR', usdPerUnit: '1.08', asOf, source: 'ecb' }]);
    expect(currency).toMatchObject({ usdPerUnit: '1.08', rateAsOf: asOf });
    expect(findOne).toHaveBeenCalledWith(FiatCurrencyEntity, { code: 'EUR' }, { lockMode: LockMode.PESSIMISTIC_WRITE });
    expect(persist).toHaveBeenCalledWith(expect.any(FiatCurrencyRateEntity));
  });

  it('keeps a late arrival in the history without moving the current rate backwards', async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    const currency = euro({ usdPerUnit: '1.09', rateAsOf: new Date('2026-08-12T00:00:00.000Z') });
    findOne.mockImplementation((entity: unknown) => Promise.resolve(entity === FiatCurrencyEntity ? currency : null));
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    await persistence.recordRates([
      { code: 'EUR', usdPerUnit: '1.08', asOf: new Date('2026-08-11T00:00:00.000Z'), source: 'ecb' },
    ]);

    expect(currency).toMatchObject({ usdPerUnit: '1.09' });
  });

  it('does not append the same quote twice', async () => {
    const { findOne, persist, entityManager } = createEntityManagerMock();
    const asOf = new Date('2026-08-12T00:00:00.000Z');
    findOne.mockImplementation((entity: unknown) =>
      Promise.resolve(
        entity === FiatCurrencyEntity
          ? euro()
          : new FiatCurrencyRateEntity({ code: 'EUR', usdPerUnit: '1.08', asOf, source: 'ecb' }),
      ),
    );
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    await persistence.recordRates([{ code: 'EUR', usdPerUnit: '1.08', asOf, source: 'ecb' }]);

    expect(persist).not.toHaveBeenCalled();
  });

  it('accepts equivalent decimal text for the same immutable observation', async () => {
    const { findOne, persist, entityManager } = createEntityManagerMock();
    const asOf = new Date('2026-08-12T00:00:00.000Z');
    const currency = euro();
    const stored = new FiatCurrencyRateEntity({ code: 'EUR', usdPerUnit: '1.0700000000', asOf, source: 'ecb' });
    findOne.mockImplementation((entity: unknown) => Promise.resolve(entity === FiatCurrencyEntity ? currency : stored));
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    await expect(persistence.recordRates([{ code: 'EUR', usdPerUnit: '1.07', asOf, source: 'ecb' }])).resolves.toEqual([
      { code: 'EUR', usdPerUnit: '1.07', asOf, source: 'ecb' },
    ]);

    expect(persist).not.toHaveBeenCalled();
  });

  it('rejects a provider retry that changes an immutable observation', async () => {
    const { findOne, persist, entityManager } = createEntityManagerMock();
    const asOf = new Date('2026-08-12T00:00:00.000Z');
    const currency = euro();
    const stored = new FiatCurrencyRateEntity({ code: 'EUR', usdPerUnit: '1.07', asOf, source: 'ecb' });
    findOne.mockImplementation((entity: unknown) => Promise.resolve(entity === FiatCurrencyEntity ? currency : stored));
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    await expect(persistence.recordRates([{ code: 'EUR', usdPerUnit: '1.08', asOf, source: 'ecb' }])).rejects.toThrow(
      /already has a different ecb observation/u,
    );

    expect(persist).not.toHaveBeenCalled();
    expect(currency).toMatchObject({ usdPerUnit: null, rateAsOf: null });
  });

  it('refuses a rate the exact arithmetic cannot hold before it reaches the table', async () => {
    const { entityManager } = createEntityManagerMock();
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    await expect(
      persistence.recordRates([{ code: 'EUR', usdPerUnit: '-1', asOf: new Date(), source: 'ecb' }]),
    ).rejects.toThrow(RangeError);
  });

  it('refuses a rate for a currency that is not in the catalogue', async () => {
    const { entityManager } = createEntityManagerMock();
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    await expect(
      persistence.recordRates([{ code: 'ZZZ', usdPerUnit: '1', asOf: new Date(), source: 'ecb' }]),
    ).rejects.toThrow(/ZZZ/u);
  });

  it('reads rate history newest first within an optional window', async () => {
    const { find, entityManager } = createEntityManagerMock();
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);
    const since = new Date('2026-08-01T00:00:00.000Z');
    const until = new Date('2026-08-12T00:00:00.000Z');

    await persistence.listRateHistory({ code: 'EUR', since, until, limit: 50 });

    expect(find).toHaveBeenCalledWith(
      FiatCurrencyRateEntity,
      { code: 'EUR', asOf: { $gte: since, $lt: until } },
      { orderBy: { asOf: 'DESC', source: 'ASC' }, limit: 50 },
    );
  });

  it('reads unbounded history when no window is given', async () => {
    const { find, entityManager } = createEntityManagerMock();
    find.mockResolvedValue([
      new FiatCurrencyRateEntity({
        code: 'EUR',
        usdPerUnit: '1.08',
        asOf: new Date('2026-08-12T00:00:00.000Z'),
        source: 'ecb',
      }),
    ]);
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    const history = await persistence.listRateHistory({ code: 'EUR', limit: 10 });

    expect(find).toHaveBeenCalledWith(
      FiatCurrencyRateEntity,
      { code: 'EUR' },
      { orderBy: { asOf: 'DESC', source: 'ASC' }, limit: 10 },
    );
    expect(history).toEqual([
      { code: 'EUR', usdPerUnit: '1.08', asOf: new Date('2026-08-12T00:00:00.000Z'), source: 'ecb' },
    ]);
  });
});
