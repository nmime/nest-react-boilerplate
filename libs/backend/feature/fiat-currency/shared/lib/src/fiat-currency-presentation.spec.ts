import { describe, expect, it } from 'vitest';
import { localizeFiatCurrency, sortFiatCurrencies } from './fiat-currency-presentation';
import type { FiatCurrency } from './fiat-currency.types';

// @requirements REQ-FIAT-CATALOG-001

const euro: FiatCurrency = {
  code: 'EUR',
  minorUnitExponent: 2,
  name: { en: 'Euro', ru: 'Евро' },
  symbol: { default: '€' },
  imageUrl: 'https://cdn.example.test/flags/eur.svg',
  active: true,
  displayOrder: 10,
  usdPerUnit: '1.08',
  rateAsOf: new Date('2026-08-12T00:00:00.000Z'),
};

describe('localizeFiatCurrency', () => {
  it('reads the name and rate for the requested locale', () => {
    expect(localizeFiatCurrency(euro, 'ru')).toEqual({
      code: 'EUR',
      name: 'Евро',
      symbol: '€',
      imageUrl: 'https://cdn.example.test/flags/eur.svg',
      minorUnitExponent: 2,
      usdPerUnit: '1.08',
      rateAsOf: new Date('2026-08-12T00:00:00.000Z'),
    });
  });

  it('prefers a locale-specific symbol over the shared one', () => {
    const localized = localizeFiatCurrency({ ...euro, symbol: { default: '€', ru: 'евро' } }, 'ru');

    expect(localized.symbol).toBe('евро');
  });

  it('walks the locale fallback chain rather than jumping straight to the default', () => {
    expect(localizeFiatCurrency(euro, 'ru-RU').name).toBe('Евро');
  });

  it('falls back to a locale the field does carry when the requested one is absent', () => {
    // A currency named only in English is still listable for a Russian reader. The alternative is
    // an empty cell in the picker, which is worse than a name in the wrong language.
    expect(localizeFiatCurrency({ ...euro, name: { en: 'Euro' } }, 'ru').name).toBe('Euro');
  });

  it('falls back to the currency code rather than failing a list response', () => {
    // An operator who adds a currency and forgets its names should get a list showing `EUR`, not a
    // 500 on the catalogue endpoint for every reader.
    const localized = localizeFiatCurrency({ ...euro, name: {}, symbol: {} }, 'ru');

    expect(localized.name).toBe('EUR');
    expect(localized.symbol).toBe('EUR');
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
