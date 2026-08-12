import {
  type Money,
  type MoneyRatio,
  type MoneyRounding,
  MoneyCurrencyMismatchError,
  currencyMinorUnitExponent,
  money,
  moneyRate,
  multiplyMoney,
} from '@app/common-money';
import type { FiatCurrency, FiatRateQuote } from './fiat-currency.types';

/** The pivot. One USD is one USD, so this quote is a constant rather than a stored row. */
export const usdRateQuote: FiatRateQuote = { code: 'USD', usdPerUnit: '1' };

const decimalTextPattern = /^-?\d+(?:\.\d+)?$/u;

/**
 * Reads stored rate text as an exact ratio.
 *
 * Trailing zeros are trimmed first. A `numeric(20,10)` column hands back `1.0800000000`, which
 * {@link moneyRate} would read as 10800000000/10000000000 — arithmetically right, but the ten
 * spare digits multiply into the cross-rate below and overflow the exact-integer range for a pair
 * that is otherwise unremarkable. `1.08` and `1.0800000000` are the same number; only one of them
 * still leaves room to compute.
 */
export function fiatRateRatio(usdPerUnit: string): MoneyRatio {
  if (!decimalTextPattern.test(usdPerUnit)) {
    throw new TypeError(`A USD rate must be decimal text such as "1.08" (received ${JSON.stringify(usdPerUnit)}).`);
  }

  const [whole = '', fraction = ''] = usdPerUnit.split('.');

  // Scanned rather than trimmed with `/0+$/`: an anchored one-or-more group re-tries from every
  // position it fails at, so a long run of zeros costs quadratic time on text that arrives from a
  // rate provider rather than from us.
  let significant = fraction.length;
  while (significant > 0 && fraction[significant - 1] === '0') {
    significant -= 1;
  }

  const trimmed = fraction.slice(0, significant);
  const ratio = moneyRate(trimmed === '' ? whole : `${whole}.${trimmed}`);

  if (ratio.numerator <= 0) {
    throw new RangeError(`A USD rate must be above zero (received ${JSON.stringify(usdPerUnit)}).`);
  }

  return ratio;
}

/** The stored rate for a catalogue row, or a refusal if none has been recorded yet. */
export function fiatCurrencyRateQuote(currency: FiatCurrency): FiatRateQuote {
  if (currency.usdPerUnit === null) {
    throw new Error(`${currency.code} has no USD rate yet: record one before converting amounts.`);
  }

  return { code: currency.code, usdPerUnit: currency.usdPerUnit };
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let [larger, smaller] = [left, right];

  while (smaller !== 0n) {
    [larger, smaller] = [smaller, larger % smaller];
  }

  return larger;
}

function toExactRatio(numerator: bigint, denominator: bigint, from: FiatRateQuote, to: FiatRateQuote): MoneyRatio {
  const limit = BigInt(Number.MAX_SAFE_INTEGER);

  if (numerator > limit || denominator > limit) {
    throw new RangeError(
      `The ${from.code}/${to.code} cross rate needs more digits than can be held exactly; ` +
        'store shorter rate text for one of the two currencies.',
    );
  }

  return { numerator: Number(numerator), denominator: Number(denominator) };
}

/**
 * Converts an amount from one currency to another through their USD rates.
 *
 * The whole cross rate — both quotes and the difference in minor-unit scale — is reduced to a
 * single exact ratio before any rounding happens, so a conversion rounds once rather than once
 * per leg. Going through USD in two rounded steps is how a chain of conversions loses a cent per
 * hop.
 */
export function convertFiatMoney(
  value: Money,
  from: FiatRateQuote,
  to: FiatRateQuote,
  rounding: MoneyRounding = 'half-even',
): Money {
  if (value.currency !== from.code) {
    throw new MoneyCurrencyMismatchError(value.currency, from.code);
  }

  if (from.code === to.code) {
    return value;
  }

  const fromRatio = fiatRateRatio(from.usdPerUnit);
  const toRatio = fiatRateRatio(to.usdPerUnit);
  const scaleShift = currencyMinorUnitExponent(to.code) - currencyMinorUnitExponent(from.code);

  const numerator = BigInt(fromRatio.numerator) * BigInt(toRatio.denominator) * 10n ** BigInt(Math.max(0, scaleShift));
  const denominator =
    BigInt(fromRatio.denominator) * BigInt(toRatio.numerator) * 10n ** BigInt(Math.max(0, -scaleShift));
  const divisor = greatestCommonDivisor(numerator, denominator);

  return multiplyMoney(
    money(value.amountMinor, to.code),
    toExactRatio(numerator / divisor, denominator / divisor, from, to),
    rounding,
  );
}

/** What an amount is worth in USD. */
export function fiatMoneyToUsd(value: Money, from: FiatRateQuote, rounding?: MoneyRounding): Money {
  return convertFiatMoney(value, from, usdRateQuote, rounding);
}

/** What a USD amount is worth in another currency. */
export function fiatMoneyFromUsd(usd: Money, to: FiatRateQuote, rounding?: MoneyRounding): Money {
  return convertFiatMoney(usd, usdRateQuote, to, rounding);
}
