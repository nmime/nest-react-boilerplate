// @requirements REQ-API-MONEY-007
// Evidence for: REQ-API-MONEY-007
import { describe, expect, it } from 'vitest';
import { Money, MoneyCurrencyMismatchError } from './money';

describe('money construction', () => {
  it('refuses an amount that is not a whole number of minor units', () => {
    expect(() => Money.of(10.5, 'USD')).toThrow('whole number of minor units');
    expect(() => Money.of(Number.NaN, 'USD')).toThrow('whole number of minor units');
  });

  it('refuses a code that is not an ISO 4217 alphabetic code', () => {
    expect(() => Money.of(100, 'usd')).toThrow('three uppercase letters');
    expect(() => Money.of(100, 'DOLLARS')).toThrow('three uppercase letters');
  });

  it('knows the currencies whose minor unit is not two digits', () => {
    expect(Money.minorUnitExponent('USD')).toBe(2);
    expect(Money.minorUnitExponent('JPY')).toBe(0);
    expect(Money.minorUnitExponent('BHD')).toBe(3);
    expect(Money.minorUnitExponent('CLF')).toBe(4);
  });

  it('lets a product register a currency the ISO table does not describe', () => {
    Money.registerCurrency({ code: 'XBT', minorUnitExponent: 8 });
    // A module that registers on import may be imported more than once; only a conflicting
    // exponent is a problem, because then two callers are already computing at different scales.
    Money.registerCurrency({ code: 'XBT', minorUnitExponent: 8 });

    expect(Money.minorUnitExponent('XBT')).toBe(8);
    expect(Money.formatAmount(Money.of(150_000_000, 'XBT'))).toBe('1.50000000');
    expect(() => {
      Money.registerCurrency({ code: 'XBT', minorUnitExponent: 2 });
    }).toThrow('already registered');
  });

  it('refuses a registration whose scale cannot describe a minor unit', () => {
    for (const exponent of [2.5, -1, 13]) {
      expect(() => {
        Money.registerCurrency({ code: 'XAA', minorUnitExponent: exponent });
      }).toThrow('whole number between 0 and 12');
    }
  });
});

describe('money arithmetic', () => {
  it('adds, subtracts, and orders amounts in one currency', () => {
    const ten = Money.of(1000, 'USD');
    const three = Money.of(300, 'USD');

    expect(Money.add(ten, three)).toEqual(Money.of(1300, 'USD'));
    expect(Money.subtract(ten, three)).toEqual(Money.of(700, 'USD'));
    expect(Money.compare(three, ten)).toBe(-1);
    expect(Money.compare(ten, three)).toBe(1);
    expect(Money.compare(ten, ten)).toBe(0);
  });

  it('refuses to combine two currencies instead of picking one', () => {
    expect(() => Money.add(Money.of(100, 'USD'), Money.of(100, 'EUR'))).toThrow(MoneyCurrencyMismatchError);
    expect(() => Money.subtract(Money.of(100, 'USD'), Money.of(100, 'EUR'))).toThrow(/USD.*EUR/u);
    expect(() => Money.compare(Money.of(100, 'USD'), Money.of(100, 'EUR'))).toThrow(MoneyCurrencyMismatchError);
  });

  it('names both sides on the refusal so a caller can convert the right one', () => {
    // Constructed directly as well as thrown: a converter that has its own rate table raises this
    // without going through an operation here, and catches it on the two code fields.
    const error = new MoneyCurrencyMismatchError('USD', 'EUR');

    expect(error.name).toBe('MoneyCurrencyMismatchError');
    expect([error.left, error.right]).toEqual(['USD', 'EUR']);
    expect(error.message).toMatch(/USD.*EUR/u);
  });
});

describe('money scaling', () => {
  it('refuses a fractional rate written as a float, because 0.1 is not 0.1', () => {
    expect(() => Money.multiply(Money.of(1000, 'USD'), 0.075)).toThrow('Money.rate');
  });

  it('scales by an exact rate parsed from decimal text', () => {
    expect(Money.multiply(Money.of(1000, 'USD'), Money.rate('0.075'))).toEqual(Money.of(75, 'USD'));
    expect(Money.multiply(Money.of(1000, 'USD'), 3)).toEqual(Money.of(3000, 'USD'));
  });

  it('rounds halves to even by default so repeated pricing does not drift upward', () => {
    // 2.5 and 3.5 minor units: half-up would return 3 and 4, biasing every split upward.
    expect(Money.multiply(Money.of(5, 'USD'), Money.rate('0.5'))).toEqual(Money.of(2, 'USD'));
    expect(Money.multiply(Money.of(7, 'USD'), Money.rate('0.5'))).toEqual(Money.of(4, 'USD'));
  });

  it('applies the rounding mode the caller asked for', () => {
    expect(Money.multiply(Money.of(5, 'USD'), Money.rate('0.5'), 'half-up')).toEqual(Money.of(3, 'USD'));
    expect(Money.multiply(Money.of(9, 'USD'), Money.rate('0.5'), 'trunc')).toEqual(Money.of(4, 'USD'));
    expect(Money.multiply(Money.of(-9, 'USD'), Money.rate('0.5'), 'trunc')).toEqual(Money.of(-4, 'USD'));
  });

  it('takes a negative half away from zero rather than upward', () => {
    // -2.5 minor units. Half-up here means half-away-from-zero, so a refund rounds to the same
    // magnitude as the charge it reverses. Libraries that read "half up" as "toward +infinity"
    // return -2, and the difference shows up only on negative ties: every credit note.
    expect(Money.multiply(Money.of(-5, 'USD'), Money.rate('0.5'), 'half-up')).toEqual(Money.of(-3, 'USD'));
    expect(Money.multiply(Money.of(5, 'USD'), Money.rate('0.5'), 'half-up')).toEqual(Money.of(3, 'USD'));
  });

  it('rounds a fraction that is not a tie in whichever direction is nearer', () => {
    expect(Money.multiply(Money.of(10, 'USD'), Money.rate('0.333'))).toEqual(Money.of(3, 'USD'));
    expect(Money.multiply(Money.of(10, 'USD'), Money.rate('0.777'))).toEqual(Money.of(8, 'USD'));
    expect(Money.multiply(Money.of(-10, 'USD'), Money.rate('0.777'))).toEqual(Money.of(-8, 'USD'));
  });

  it('carries the sign of a negative rate', () => {
    expect(Money.multiply(Money.of(1000, 'USD'), Money.rate('-0.5'))).toEqual(Money.of(-500, 'USD'));
    expect(Money.multiply(Money.of(-5, 'USD'), Money.rate('0.5'))).toEqual(Money.of(-2, 'USD'));
  });

  it('rejects a rate that is not exact decimal text', () => {
    expect(() => Money.rate('1/3')).toThrow('decimal');
    expect(() => Money.rate('')).toThrow('decimal');
    expect(() => Money.rate(`0.${'9'.repeat(20)}`)).toThrow('more digits than can be represented');
  });

  it('rejects a ratio that does not describe a division', () => {
    expect(() => Money.multiply(Money.of(100, 'USD'), { numerator: 1, denominator: 0 })).toThrow(
      'positive whole number',
    );
  });

  it('refuses a result that no longer fits in an exact integer', () => {
    const huge = Money.of(Number.MAX_SAFE_INTEGER, 'USD');

    expect(() => Money.multiply(huge, 2)).toThrow('too large to represent exactly');
    expect(() => Money.multiply(Money.of(-Number.MAX_SAFE_INTEGER, 'USD'), 2)).toThrow(
      'too large to represent exactly',
    );
  });
});

describe('money allocation', () => {
  it('splits an amount so the parts always sum back to the whole', () => {
    const parts = Money.allocate(Money.of(1000, 'USD'), [1, 1, 1]);

    expect(parts).toEqual([Money.of(334, 'USD'), Money.of(333, 'USD'), Money.of(333, 'USD')]);
    expect(parts.reduce((total, part) => Money.add(total, part), Money.of(0, 'USD'))).toEqual(Money.of(1000, 'USD'));
  });

  it('respects weights and keeps a negative amount symmetric with its positive', () => {
    expect(Money.allocate(Money.of(500, 'USD'), [3, 7])).toEqual([Money.of(150, 'USD'), Money.of(350, 'USD')]);
    expect(Money.allocate(Money.of(-1000, 'USD'), [1, 1, 1])).toEqual([
      Money.of(-334, 'USD'),
      Money.of(-333, 'USD'),
      Money.of(-333, 'USD'),
    ]);
  });

  it('hands the leftover units to the earliest weights, not to the largest', () => {
    // Every case above is symmetric enough that the earliest-weight policy and a largest-weight
    // one agree, so none of them can tell the two apart. This one can: 100 over [1, 2, 3] floors
    // to 16/33/50 with one unit spare, which goes to the first weight here and to the last under
    // the policy most libraries implement.
    expect(Money.allocate(Money.of(100, 'USD'), [1, 2, 3])).toEqual([
      Money.of(17, 'USD'),
      Money.of(33, 'USD'),
      Money.of(50, 'USD'),
    ]);
    expect(Money.allocate(Money.of(11, 'USD'), [2, 3, 5])).toEqual([
      Money.of(3, 'USD'),
      Money.of(3, 'USD'),
      Money.of(5, 'USD'),
    ]);
  });

  it('passes a zero weight over when handing out the leftover units', () => {
    expect(Money.allocate(Money.of(1000, 'USD'), [0, 1, 1, 1])).toEqual([
      Money.of(0, 'USD'),
      Money.of(334, 'USD'),
      Money.of(333, 'USD'),
      Money.of(333, 'USD'),
    ]);
  });

  it('refuses weights that cannot describe a split', () => {
    expect(() => Money.allocate(Money.of(100, 'USD'), [])).toThrow('at least one weight');
    expect(() => Money.allocate(Money.of(100, 'USD'), [1, -1])).toThrow('non-negative');
    expect(() => Money.allocate(Money.of(100, 'USD'), [0, 0])).toThrow('at least one weight above zero');
  });
});

describe('money decimal text', () => {
  it('parses and renders using the exponent of the currency, not a fixed two places', () => {
    expect(Money.parse('12.34', 'USD')).toEqual(Money.of(1234, 'USD'));
    expect(Money.parse('1200', 'JPY')).toEqual(Money.of(1200, 'JPY'));
    expect(Money.parse('-0.5', 'USD')).toEqual(Money.of(-50, 'USD'));

    expect(Money.formatAmount(Money.of(1234, 'USD'))).toBe('12.34');
    expect(Money.formatAmount(Money.of(1200, 'JPY'))).toBe('1200');
    expect(Money.formatAmount(Money.of(-5, 'USD'))).toBe('-0.05');
    expect(Money.formatAmount(Money.of(1, 'BHD'))).toBe('0.001');
  });

  it('refuses text with more decimal places than the currency can hold', () => {
    // Silently truncating is how a price becomes wrong by a cent nobody can trace.
    expect(() => Money.parse('12.345', 'USD')).toThrow('at most 2 decimal places');
    expect(() => Money.parse('12.5', 'JPY')).toThrow('at most 0 decimal places');
    expect(() => Money.parse('12,34', 'USD')).toThrow('decimal');
  });

  it('renders a localised amount for display', () => {
    expect(Money.format(Money.of(123_456, 'USD'), 'en-US')).toBe('$1,234.56');
    expect(Money.format(Money.of(1200, 'JPY'), 'en-US')).toBe('¥1,200');
    expect(Money.format(Money.of(123_456, 'USD'), 'en-US', { currencyDisplay: 'code' })).toContain('USD');
  });
});
