// @requirements REQ-FIAT-CATALOG-001
import {
  type FiatCurrency,
  type FiatCurrencyRate,
  type FiatCurrencyTranslation,
  FiatCurrencyPersistence,
  type ListFiatCurrenciesFilter,
  type ListFiatRateHistoryQuery,
  type RecordFiatRateParams,
  type UpsertFiatCurrencyParams,
} from '@app/backend-feature-fiat-currency-shared';
import { money } from '@app/common-money';
import { describe, expect, it, vi } from 'vitest';
import { FiatCurrencyService } from './fiat-currency.service';

const asOf = new Date('2026-08-12T00:00:00.000Z');

function currency(overrides: Partial<FiatCurrency> = {}): FiatCurrency {
  return {
    code: 'EUR',
    minorUnitExponent: 2,
    symbol: '€',
    imageUrl: null,
    active: true,
    displayOrder: 0,
    usdPerUnit: '1.08',
    rateAsOf: asOf,
    ...overrides,
  };
}

class StubPersistence extends FiatCurrencyPersistence {
  currencies: FiatCurrency[] = [];
  translations: FiatCurrencyTranslation[] = [];
  history: FiatCurrencyRate[] = [];
  readonly listCurrencies = vi.fn((_filter: ListFiatCurrenciesFilter) => Promise.resolve(this.currencies));
  readonly findCurrency = vi.fn((code: string) =>
    Promise.resolve(this.currencies.find((entry) => entry.code === code) ?? null),
  );
  readonly listTranslations = vi.fn((_codes: readonly string[]) => Promise.resolve(this.translations));
  readonly upsertCurrency = vi.fn((params: UpsertFiatCurrencyParams) =>
    Promise.resolve(currency({ code: params.code, symbol: params.symbol })),
  );
  readonly deactivateCurrency = vi.fn((_code: string) => Promise.resolve(true));
  readonly recordRates = vi.fn((rates: readonly RecordFiatRateParams[]) => Promise.resolve([...rates]));
  readonly listRateHistory = vi.fn((_query: ListFiatRateHistoryQuery) => Promise.resolve(this.history));
}

function createService() {
  const persistence = new StubPersistence();

  return { persistence, service: new FiatCurrencyService(persistence) };
}

describe('FiatCurrencyService', () => {
  it('answers the catalogue in the caller locale', async () => {
    const { persistence, service } = createService();
    persistence.currencies = [currency(), currency({ code: 'JPY', symbol: '¥', minorUnitExponent: 0 })];
    persistence.translations = [{ code: 'EUR', locale: 'ru', name: 'Евро', symbol: 'евро' }];

    const listed = await service.listCurrencies('ru-RU');

    expect(persistence.listTranslations).toHaveBeenCalledWith(['EUR', 'JPY']);
    expect(listed[0]).toMatchObject({ code: 'EUR', name: 'Евро', symbol: 'евро' });
    // Nothing translated JPY, so its own code and symbol stand in rather than an empty label.
    expect(listed[1]).toMatchObject({ code: 'JPY', name: 'JPY', symbol: '¥' });
  });

  it('serves only active currencies unless the caller asks for the retired ones', async () => {
    const { persistence, service } = createService();

    await service.listCurrencies('en');
    expect(persistence.listCurrencies).toHaveBeenCalledWith({ activeOnly: true });

    await service.listCurrencies('en', { includeInactive: true });
    expect(persistence.listCurrencies).toHaveBeenLastCalledWith({ activeOnly: false });
  });

  it('converts through the stored USD rates', async () => {
    const { persistence, service } = createService();
    persistence.currencies = [currency(), currency({ code: 'JPY', symbol: '¥', usdPerUnit: '0.0064' })];

    // 100.00 EUR at 1.08 USD/EUR is 108 USD, which at 0.0064 USD/JPY is 16875 JPY — and the yen
    // has no minor unit, so that is 16875 minor units, not 1687500.
    expect(await service.convert(money(10_000, 'EUR'), 'JPY')).toEqual(money(16_875, 'JPY'));
  });

  it('honours the rounding the caller asks for', async () => {
    const { persistence, service } = createService();
    persistence.currencies = [currency(), currency({ code: 'GBP', symbol: '£', usdPerUnit: '1.27' })];

    // 100.00 EUR is 108 USD, which is 85.0393… GBP: the last penny depends on the rounding mode.
    expect(await service.convert(money(10_000, 'EUR'), 'GBP')).toEqual(money(8_504, 'GBP'));
    expect(await service.convert(money(10_000, 'EUR'), 'GBP', 'trunc')).toEqual(money(8_503, 'GBP'));
  });

  it('names the currency it could not find rather than converting into a guess', async () => {
    const { persistence, service } = createService();
    persistence.currencies = [currency()];

    await expect(service.convert(money(10_000, 'EUR'), 'JPY')).rejects.toThrow(/JPY/u);
    await expect(service.convert(money(10_000, 'JPY'), 'EUR')).rejects.toThrow(/JPY/u);
  });

  it('reads a currency, or nothing', async () => {
    const { persistence, service } = createService();
    persistence.currencies = [currency()];

    expect(await service.findCurrency('EUR')).toMatchObject({ code: 'EUR' });
    expect(await service.findCurrency('JPY')).toBeNull();
  });

  it('bounds a history request so one call cannot ask for every quote ever taken', async () => {
    const { persistence, service } = createService();

    await service.listRateHistory({ code: 'EUR' });
    expect(persistence.listRateHistory).toHaveBeenCalledWith({ code: 'EUR', limit: 100 });

    await service.listRateHistory({ code: 'EUR', limit: 5_000 });
    expect(persistence.listRateHistory).toHaveBeenLastCalledWith({ code: 'EUR', limit: 1_000 });

    await service.listRateHistory({ code: 'EUR', since: asOf, limit: 10 });
    expect(persistence.listRateHistory).toHaveBeenLastCalledWith({ code: 'EUR', since: asOf, limit: 10 });
  });

  it('passes catalogue writes straight through to the persistence port', async () => {
    const { persistence, service } = createService();

    await service.upsertCurrency({ code: 'EUR', symbol: '€' });
    expect(persistence.upsertCurrency).toHaveBeenCalledWith({ code: 'EUR', symbol: '€' });

    expect(await service.deactivateCurrency('EUR')).toBe(true);
    expect(persistence.deactivateCurrency).toHaveBeenCalledWith('EUR');
  });
});
