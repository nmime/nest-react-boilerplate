// @requirements REQ-API-MONEY-007
// Evidence for: REQ-API-MONEY-007
import { describe, expect, it } from 'vitest';
import {
  addMoney,
  allocateMoney,
  compareMoney,
  currencyMinorUnitExponent,
  formatMoney,
  formatMoneyAmount,
  isZeroMoney,
  MoneyCurrencyMismatchError,
  money,
  moneyRate,
  multiplyMoney,
  negateMoney,
  parseMoney,
  registerCurrency,
  subtractMoney,
  zeroMoney,
} from './money';

describe('money construction', () => {
  it('refuses an amount that is not a whole number of minor units', () => {
    expect(() => money(10.5, 'USD')).toThrow('whole number of minor units');
    expect(() => money(Number.NaN, 'USD')).toThrow('whole number of minor units');
  });

  it('refuses a code that is not an ISO 4217 alphabetic code', () => {
    expect(() => money(100, 'usd')).toThrow('three uppercase letters');
    expect(() => money(100, 'DOLLARS')).toThrow('three uppercase letters');
  });

  it('knows the currencies whose minor unit is not two digits', () => {
    expect(currencyMinorUnitExponent('USD')).toBe(2);
    expect(currencyMinorUnitExponent('JPY')).toBe(0);
    expect(currencyMinorUnitExponent('BHD')).toBe(3);
    expect(currencyMinorUnitExponent('CLF')).toBe(4);
  });

  it('lets a product register a currency the ISO table does not describe', () => {
    registerCurrency({ code: 'XBT', minorUnitExponent: 8 });
    // A module that registers on import may be imported more than once; only a conflicting
    // exponent is a problem, because then two callers are already computing at different scales.
    registerCurrency({ code: 'XBT', minorUnitExponent: 8 });

    expect(currencyMinorUnitExponent('XBT')).toBe(8);
    expect(formatMoneyAmount(money(150_000_000, 'XBT'))).toBe('1.50000000');
    expect(() => registerCurrency({ code: 'XBT', minorUnitExponent: 2 })).toThrow('already registered');
  });

  it('refuses a registration whose scale cannot describe a minor unit', () => {
    expect(() => registerCurrency({ code: 'XAA', minorUnitExponent: 2.5 })).toThrow('whole number between 0 and 12');
    expect(() => registerCurrency({ code: 'XAA', minorUnitExponent: -1 })).toThrow('whole number between 0 and 12');
    expect(() => registerCurrency({ code: 'XAA', minorUnitExponent: 13 })).toThrow('whole number between 0 and 12');
  });
});

describe('money arithmetic', () => {
  it('adds, subtracts, negates, and orders amounts in one currency', () => {
    const ten = money(1000, 'USD');
    const three = money(300, 'USD');

    expect(addMoney(ten, three)).toEqual(money(1300, 'USD'));
    expect(subtractMoney(ten, three)).toEqual(money(700, 'USD'));
    expect(negateMoney(three)).toEqual(money(-300, 'USD'));
    expect(compareMoney(three, ten)).toBe(-1);
    expect(compareMoney(ten, three)).toBe(1);
    expect(compareMoney(ten, ten)).toBe(0);
    expect(zeroMoney('USD')).toEqual(money(0, 'USD'));
    expect(isZeroMoney(zeroMoney('USD'))).toBe(true);
    expect(isZeroMoney(ten)).toBe(false);
  });

  it('refuses to combine two currencies instead of picking one', () => {
    expect(() => addMoney(money(100, 'USD'), money(100, 'EUR'))).toThrow(MoneyCurrencyMismatchError);
    expect(() => subtractMoney(money(100, 'USD'), money(100, 'EUR'))).toThrow(/USD.*EUR/u);
  });
});

describe('money scaling', () => {
  it('refuses a fractional rate written as a float, because 0.1 is not 0.1', () => {
    expect(() => multiplyMoney(money(1000, 'USD'), 0.075)).toThrow('moneyRate');
  });

  it('scales by an exact rate parsed from decimal text', () => {
    expect(multiplyMoney(money(1000, 'USD'), moneyRate('0.075'))).toEqual(money(75, 'USD'));
    expect(multiplyMoney(money(1000, 'USD'), 3)).toEqual(money(3000, 'USD'));
  });

  it('rounds halves to even by default so repeated pricing does not drift upward', () => {
    // 2.5 and 3.5 minor units: half-up would return 3 and 4, biasing every split upward.
    expect(multiplyMoney(money(5, 'USD'), moneyRate('0.5'))).toEqual(money(2, 'USD'));
    expect(multiplyMoney(money(7, 'USD'), moneyRate('0.5'))).toEqual(money(4, 'USD'));
  });

  it('applies the rounding mode the caller asked for', () => {
    expect(multiplyMoney(money(5, 'USD'), moneyRate('0.5'), 'half-up')).toEqual(money(3, 'USD'));
    expect(multiplyMoney(money(9, 'USD'), moneyRate('0.5'), 'trunc')).toEqual(money(4, 'USD'));
    expect(multiplyMoney(money(-9, 'USD'), moneyRate('0.5'), 'trunc')).toEqual(money(-4, 'USD'));
  });

  it('takes a negative half away from zero rather than upward', () => {
    // -2.5 minor units. Half-up here means half-away-from-zero, so a refund rounds to the same
    // magnitude as the charge it reverses. Libraries that read "half up" as "toward +infinity"
    // return -2, and the difference shows up only on negative ties: every credit note.
    expect(multiplyMoney(money(-5, 'USD'), moneyRate('0.5'), 'half-up')).toEqual(money(-3, 'USD'));
    expect(multiplyMoney(money(5, 'USD'), moneyRate('0.5'), 'half-up')).toEqual(money(3, 'USD'));
  });

  it('rounds a fraction that is not a tie in whichever direction is nearer', () => {
    expect(multiplyMoney(money(10, 'USD'), moneyRate('0.333'))).toEqual(money(3, 'USD'));
    expect(multiplyMoney(money(10, 'USD'), moneyRate('0.777'))).toEqual(money(8, 'USD'));
    expect(multiplyMoney(money(-10, 'USD'), moneyRate('0.777'))).toEqual(money(-8, 'USD'));
  });

  it('carries the sign of a negative rate', () => {
    expect(multiplyMoney(money(1000, 'USD'), moneyRate('-0.5'))).toEqual(money(-500, 'USD'));
    expect(multiplyMoney(money(-5, 'USD'), moneyRate('0.5'))).toEqual(money(-2, 'USD'));
  });

  it('rejects a rate that is not exact decimal text', () => {
    expect(() => moneyRate('1/3')).toThrow('decimal');
    expect(() => moneyRate('')).toThrow('decimal');
    expect(() => moneyRate(`0.${'9'.repeat(20)}`)).toThrow('more digits than can be represented');
  });

  it('rejects a ratio that does not describe a division', () => {
    expect(() => multiplyMoney(money(100, 'USD'), { numerator: 1, denominator: 0 })).toThrow('positive whole number');
  });

  it('refuses a result that no longer fits in an exact integer', () => {
    const huge = money(Number.MAX_SAFE_INTEGER, 'USD');

    expect(() => multiplyMoney(huge, 2)).toThrow('too large to represent exactly');
    expect(() => multiplyMoney(negateMoney(huge), 2)).toThrow('too large to represent exactly');
  });
});

describe('money allocation', () => {
  it('splits an amount so the parts always sum back to the whole', () => {
    const parts = allocateMoney(money(1000, 'USD'), [1, 1, 1]);

    expect(parts).toEqual([money(334, 'USD'), money(333, 'USD'), money(333, 'USD')]);
    expect(parts.reduce(addMoney)).toEqual(money(1000, 'USD'));
  });

  it('respects weights and keeps a negative amount symmetric with its positive', () => {
    expect(allocateMoney(money(500, 'USD'), [3, 7])).toEqual([money(150, 'USD'), money(350, 'USD')]);
    expect(allocateMoney(money(-1000, 'USD'), [1, 1, 1])).toEqual([
      money(-334, 'USD'),
      money(-333, 'USD'),
      money(-333, 'USD'),
    ]);
  });

  it('hands the leftover units to the earliest weights, not to the largest', () => {
    // Every case above is symmetric enough that the earliest-weight policy and a largest-weight
    // one agree, so none of them can tell the two apart. This one can: 100 over [1, 2, 3] floors
    // to 16/33/50 with one unit spare, which goes to the first weight here and to the last under
    // the policy most libraries implement.
    expect(allocateMoney(money(100, 'USD'), [1, 2, 3])).toEqual([
      money(17, 'USD'),
      money(33, 'USD'),
      money(50, 'USD'),
    ]);
    expect(allocateMoney(money(11, 'USD'), [2, 3, 5])).toEqual([money(3, 'USD'), money(3, 'USD'), money(5, 'USD')]);
  });

  it('passes a zero weight over when handing out the leftover units', () => {
    expect(allocateMoney(money(1000, 'USD'), [0, 1, 1, 1])).toEqual([
      money(0, 'USD'),
      money(334, 'USD'),
      money(333, 'USD'),
      money(333, 'USD'),
    ]);
  });

  it('refuses weights that cannot describe a split', () => {
    expect(() => allocateMoney(money(100, 'USD'), [])).toThrow('at least one weight');
    expect(() => allocateMoney(money(100, 'USD'), [1, -1])).toThrow('non-negative');
    expect(() => allocateMoney(money(100, 'USD'), [0, 0])).toThrow('at least one weight above zero');
  });
});

describe('money decimal text', () => {
  it('parses and renders using the exponent of the currency, not a fixed two places', () => {
    expect(parseMoney('12.34', 'USD')).toEqual(money(1234, 'USD'));
    expect(parseMoney('1200', 'JPY')).toEqual(money(1200, 'JPY'));
    expect(parseMoney('-0.5', 'USD')).toEqual(money(-50, 'USD'));

    expect(formatMoneyAmount(money(1234, 'USD'))).toBe('12.34');
    expect(formatMoneyAmount(money(1200, 'JPY'))).toBe('1200');
    expect(formatMoneyAmount(money(-5, 'USD'))).toBe('-0.05');
    expect(formatMoneyAmount(money(1, 'BHD'))).toBe('0.001');
  });

  it('refuses text with more decimal places than the currency can hold', () => {
    // Silently truncating is how a price becomes wrong by a cent nobody can trace.
    expect(() => parseMoney('12.345', 'USD')).toThrow('at most 2 decimal places');
    expect(() => parseMoney('12.5', 'JPY')).toThrow('at most 0 decimal places');
    expect(() => parseMoney('12,34', 'USD')).toThrow('decimal');
  });

  it('renders a localised amount for display', () => {
    expect(formatMoney(money(123_456, 'USD'), 'en-US')).toBe('$1,234.56');
    expect(formatMoney(money(1200, 'JPY'), 'en-US')).toBe('¥1,200');
    expect(formatMoney(money(123_456, 'USD'), 'en-US', { currencyDisplay: 'code' })).toContain('USD');
  });
});
