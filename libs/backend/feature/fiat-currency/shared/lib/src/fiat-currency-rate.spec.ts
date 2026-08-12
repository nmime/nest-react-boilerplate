import { MoneyCurrencyMismatchError, money } from '@app/common-money';
import { describe, expect, it } from 'vitest';
import {
  convertFiatMoney,
  fiatCurrencyRateQuote,
  fiatMoneyFromUsd,
  fiatMoneyToUsd,
  fiatRateRatio,
  usdRateQuote,
} from './fiat-currency-rate';
import type { FiatCurrency } from './fiat-currency.types';

// @requirements REQ-FIAT-RATE-002

const currency = (overrides: Partial<FiatCurrency> = {}): FiatCurrency => ({
  code: 'EUR',
  minorUnitExponent: 2,
  symbol: '€',
  imageUrl: null,
  active: true,
  displayOrder: 0,
  usdPerUnit: '1.08',
  rateAsOf: new Date('2026-08-12T00:00:00.000Z'),
  ...overrides,
});

describe('fiatRateRatio', () => {
  it('reads decimal rate text as an exact ratio', () => {
    expect(fiatRateRatio('0.0064')).toEqual({ numerator: 64, denominator: 10000 });
  });

  it('trims trailing zeros so a numeric(20,10) column does not overflow the ratio', () => {
    expect(fiatRateRatio('1.0800000000')).toEqual({ numerator: 108, denominator: 100 });
    expect(fiatRateRatio('1.0000000000')).toEqual({ numerator: 1, denominator: 1 });
  });

  it('accepts whole-number rate text', () => {
    expect(fiatRateRatio('1')).toEqual({ numerator: 1, denominator: 1 });
  });

  it('rejects text that is not a decimal', () => {
    expect(() => fiatRateRatio('1,08')).toThrow(TypeError);
  });

  it('rejects a zero or negative rate', () => {
    expect(() => fiatRateRatio('0')).toThrow(RangeError);
    expect(() => fiatRateRatio('0.0000')).toThrow(RangeError);
    expect(() => fiatRateRatio('-1.08')).toThrow(RangeError);
  });
});

describe('fiatCurrencyRateQuote', () => {
  it('reads the stored rate off a currency row', () => {
    expect(fiatCurrencyRateQuote(currency())).toEqual({ code: 'EUR', usdPerUnit: '1.08' });
  });

  it('refuses a currency that has no rate recorded yet', () => {
    expect(() => fiatCurrencyRateQuote(currency({ usdPerUnit: null }))).toThrow(/no USD rate/u);
  });
});

describe('convertFiatMoney', () => {
  it('converts a zero-exponent currency up to USD cents', () => {
    const yen = money(1000, 'JPY');

    expect(convertFiatMoney(yen, { code: 'JPY', usdPerUnit: '0.0064' }, usdRateQuote)).toEqual(money(640, 'USD'));
  });

  it('converts USD cents down to a zero-exponent currency', () => {
    const dollars = money(10_000, 'USD');

    expect(convertFiatMoney(dollars, usdRateQuote, { code: 'JPY', usdPerUnit: '0.0064' })).toEqual(
      money(15_625, 'JPY'),
    );
  });

  it('converts between two non-USD currencies through their USD rates', () => {
    const euros = money(10_000, 'EUR');

    expect(convertFiatMoney(euros, { code: 'EUR', usdPerUnit: '1.08' }, { code: 'GBP', usdPerUnit: '1.27' })).toEqual(
      money(8504, 'GBP'),
    );
  });

  it('honours the named rounding mode', () => {
    const euros = money(10_000, 'EUR');

    expect(
      convertFiatMoney(euros, { code: 'EUR', usdPerUnit: '1.08' }, { code: 'GBP', usdPerUnit: '1.27' }, 'trunc'),
    ).toEqual(money(8503, 'GBP'));
  });

  it('survives rate text at the full stored scale', () => {
    const euros = money(10_000, 'EUR');

    expect(
      convertFiatMoney(euros, { code: 'EUR', usdPerUnit: '1.0812345678' }, { code: 'GBP', usdPerUnit: '1.2712345678' }),
    ).toEqual(money(8505, 'GBP'));
  });

  it('is the identity for a single currency, whatever the quotes say', () => {
    const euros = money(10_000, 'EUR');

    expect(convertFiatMoney(euros, { code: 'EUR', usdPerUnit: '1.08' }, { code: 'EUR', usdPerUnit: '1.09' })).toBe(
      euros,
    );
  });

  it('refuses an amount that is not in the source currency', () => {
    expect(() => convertFiatMoney(money(100, 'USD'), { code: 'EUR', usdPerUnit: '1.08' }, usdRateQuote)).toThrow(
      MoneyCurrencyMismatchError,
    );
  });

  it('refuses a pair whose rates cannot be held exactly', () => {
    expect(() =>
      convertFiatMoney(
        money(1000, 'JPY'),
        { code: 'JPY', usdPerUnit: '1.000000000000003' },
        { code: 'BHD', usdPerUnit: '3.000000000000007' },
      ),
    ).toThrow(RangeError);
  });
});

describe('fiatMoneyToUsd', () => {
  it('quotes an amount in USD', () => {
    expect(fiatMoneyToUsd(money(10_000, 'EUR'), { code: 'EUR', usdPerUnit: '1.08' })).toEqual(money(10_800, 'USD'));
  });
});

describe('fiatMoneyFromUsd', () => {
  it('prices a USD amount in another currency', () => {
    expect(fiatMoneyFromUsd(money(10_800, 'USD'), { code: 'EUR', usdPerUnit: '1.08' })).toEqual(money(10_000, 'EUR'));
  });
});
