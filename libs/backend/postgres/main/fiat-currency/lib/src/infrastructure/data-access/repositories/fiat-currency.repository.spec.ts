// @requirements REQ-FIAT-HISTORY-003
import type { EntityManager } from '@mikro-orm/postgresql';
import { describe, expect, it, vi } from 'vitest';
import { FiatCurrencyEntity, FiatCurrencyRateEntity, FiatCurrencyTranslationEntity } from '../entities';
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
  Object.assign(new FiatCurrencyEntity({ code: 'EUR', symbol: '€' }), overrides);

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
        symbol: '€',
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
    expect(await persistence.findCurrency('EUR')).toMatchObject({ code: 'EUR', usdPerUnit: '1.0800000000' });
  });

  it('does not query for translations of nothing', async () => {
    const { find, entityManager } = createEntityManagerMock();
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    expect(await persistence.listTranslations([])).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('reads translations for the codes it was given', async () => {
    const { find, entityManager } = createEntityManagerMock();
    find.mockResolvedValue([new FiatCurrencyTranslationEntity({ code: 'EUR', locale: 'ru', name: 'Евро' })]);
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    const translations = await persistence.listTranslations(['EUR']);

    expect(find).toHaveBeenCalledWith(FiatCurrencyTranslationEntity, { code: { $in: ['EUR'] } });
    expect(translations).toEqual([{ code: 'EUR', locale: 'ru', name: 'Евро', symbol: null }]);
  });

  it('creates a currency that is not in the catalogue yet', async () => {
    const { findOne, persist, entityManager } = createEntityManagerMock();
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    const created = await persistence.upsertCurrency({ code: 'JPY', symbol: '¥' });

    expect(persist).toHaveBeenCalledWith(expect.any(FiatCurrencyEntity));
    expect(findOne).toHaveBeenCalledWith(FiatCurrencyEntity, { code: 'JPY' });
    expect(created).toMatchObject({ code: 'JPY', minorUnitExponent: 0, active: true });
  });

  it('updates only the fields an operator supplied', async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(euro({ displayOrder: 7, imageUrl: 'https://cdn.example.test/eur.svg' }));
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    const updated = await persistence.upsertCurrency({ code: 'EUR', symbol: '€', active: false });

    expect(updated).toMatchObject({ active: false, displayOrder: 7, imageUrl: 'https://cdn.example.test/eur.svg' });
  });

  it('accepts a new image and minor unit for an existing currency', async () => {
    const { findOne, entityManager } = createEntityManagerMock();
    findOne.mockResolvedValue(euro({ imageUrl: 'https://cdn.example.test/old.svg' }));
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    const updated = await persistence.upsertCurrency({
      code: 'EUR',
      symbol: '€',
      minorUnitExponent: 4,
      imageUrl: 'https://cdn.example.test/new.svg',
    });

    expect(updated).toMatchObject({ minorUnitExponent: 4, imageUrl: 'https://cdn.example.test/new.svg' });
  });

  it('clears a locale symbol back to the canonical one', async () => {
    const { findOne, find, entityManager } = createEntityManagerMock();
    const existing = new FiatCurrencyTranslationEntity({ code: 'EUR', locale: 'ru', name: 'Евро', symbol: 'евро' });
    findOne.mockResolvedValue(euro());
    find.mockResolvedValue([existing]);
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    await persistence.upsertCurrency({
      code: 'EUR',
      symbol: '€',
      translations: [{ locale: 'ru', name: 'Евро' }],
    });

    expect(existing.symbol).toBeNull();
  });

  it('replaces the named translations and leaves other locales alone', async () => {
    const { findOne, find, persist, entityManager } = createEntityManagerMock();
    const existing = new FiatCurrencyTranslationEntity({ code: 'EUR', locale: 'ru', name: 'Евро' });
    findOne.mockResolvedValue(euro());
    find.mockResolvedValue([existing]);
    const persistence = new FiatCurrencyPostgresPersistence(entityManager);

    await persistence.upsertCurrency({
      code: 'EUR',
      symbol: '€',
      translations: [
        { locale: 'ru', name: 'Евро', symbol: 'евро' },
        { locale: 'en', name: 'Euro' },
      ],
    });

    expect(existing.symbol).toBe('евро');
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'EUR', locale: 'en', name: 'Euro', symbol: null }),
    );
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
      { orderBy: { asOf: 'DESC' }, limit: 50 },
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
      { orderBy: { asOf: 'DESC' }, limit: 10 },
    );
    expect(history).toEqual([
      { code: 'EUR', usdPerUnit: '1.08', asOf: new Date('2026-08-12T00:00:00.000Z'), source: 'ecb' },
    ]);
  });
});
