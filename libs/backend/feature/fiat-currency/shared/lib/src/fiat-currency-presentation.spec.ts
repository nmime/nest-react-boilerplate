import { describe, expect, it } from 'vitest';
import { localizeFiatCurrency, sortFiatCurrencies } from './fiat-currency-presentation';
import type { FiatCurrency, FiatCurrencyTranslation } from './fiat-currency.types';

// @requirements REQ-FIAT-CATALOG-001

const euro: FiatCurrency = {
  code: 'EUR',
  minorUnitExponent: 2,
  symbol: '€',
  imageUrl: 'https://cdn.example.test/flags/eur.svg',
  active: true,
  displayOrder: 10,
  usdPerUnit: '1.08',
  rateAsOf: new Date('2026-08-12T00:00:00.000Z'),
};

const translation = (overrides: Partial<FiatCurrencyTranslation> = {}): FiatCurrencyTranslation => ({
  code: 'EUR',
  locale: 'en',
  name: 'Euro',
  symbol: null,
  ...overrides,
});

describe('localizeFiatCurrency', () => {
  it('reads the name and rate for the requested locale', () => {
    const localized = localizeFiatCurrency(euro, [translation(), translation({ locale: 'ru', name: 'Евро' })], 'ru');

    expect(localized).toEqual({
      code: 'EUR',
      name: 'Евро',
      symbol: '€',
      imageUrl: 'https://cdn.example.test/flags/eur.svg',
      minorUnitExponent: 2,
      usdPerUnit: '1.08',
      rateAsOf: new Date('2026-08-12T00:00:00.000Z'),
    });
  });

  it('prefers a locale-specific symbol over the canonical one', () => {
    const localized = localizeFiatCurrency(euro, [translation({ locale: 'ru', name: 'Евро', symbol: 'евро' })], 'ru');

    expect(localized.symbol).toBe('евро');
  });

  it('walks the locale fallback chain rather than jumping straight to the default', () => {
    const localized = localizeFiatCurrency(euro, [translation(), translation({ locale: 'ru', name: 'Евро' })], 'ru-RU');

    expect(localized.name).toBe('Евро');
  });

  it('falls back to a translated locale when the requested one has no row', () => {
    const localized = localizeFiatCurrency(euro, [translation()], 'ru');

    expect(localized.name).toBe('Euro');
  });

  it('falls back to the currency code rather than failing a list response', () => {
    const localized = localizeFiatCurrency(euro, [], 'ru');

    expect(localized.name).toBe('EUR');
    expect(localized.symbol).toBe('€');
  });

  it('ignores translations belonging to another currency', () => {
    const localized = localizeFiatCurrency(euro, [translation({ code: 'GBP', name: 'Pound sterling' })], 'en');

    expect(localized.name).toBe('EUR');
  });
});

describe('sortFiatCurrencies', () => {
  it('orders by display order, then by code so the list is stable', () => {
    const currencies: FiatCurrency[] = [
      { ...euro, code: 'USD', displayOrder: 10 },
      { ...euro, code: 'GBP', displayOrder: 20 },
      { ...euro, code: 'EUR', displayOrder: 10 },
    ];

    expect(sortFiatCurrencies(currencies).map((entry) => entry.code)).toEqual(['EUR', 'USD', 'GBP']);
  });
});
