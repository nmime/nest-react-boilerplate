/**
 * Monetary amounts as whole minor units plus a currency.
 *
 * A `number` of major units cannot represent money: `0.1 + 0.2` is not `0.3`, and the error
 * compounds through every discount, tax line, and split. Every value here is an integer count
 * of the currency's smallest unit, and every operation that could lose a unit either says which
 * way it rounded or refuses to guess.
 *
 * The operations hang off {@link Money} rather than standing alone, so a call site reads
 * `Money.add(a, b)` instead of repeating the noun in every name. The type and the namespace share
 * that name deliberately: `Money` is what you hold, and `Money.` is what you can do with it.
 */

/**
 * ISO 4217 alphabetic code, uppercase.
 *
 * An alias over `string` rather than a union of codes: the table is extensible at runtime through
 * {@link Money.registerCurrency}, so a closed union would refuse the crypto and ledger units a
 * product adds. The name is what makes a signature readable — `of(amount: number, currency:
 * CurrencyCode)` says which string is meant, where two bare `string`s would not.
 */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- named for the reason above.
export type CurrencyCode = string;

export interface Money {
  /** Whole number of minor units — cents for USD, yen for JPY, fils for BHD. */
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export interface CurrencyDefinition {
  readonly code: CurrencyCode;
  /** Decimal places in the currency's minor unit: 2 for USD, 0 for JPY, 3 for BHD. */
  readonly minorUnitExponent: number;
}

/** How a scaling operation resolves a fraction of a minor unit. */
export type MoneyRounding = 'half-even' | 'half-up' | 'trunc';

/** An exact ratio. Build one with {@link Money.rate}; a float cannot express 7.5% exactly. */
export interface MoneyRatio {
  readonly numerator: number;
  readonly denominator: number;
}

/** An integer multiplier, or an exact ratio for anything fractional. */
export type MoneyRate = number | MoneyRatio;

const currencyCodePattern = /^[A-Z]{3}$/u;
const decimalTextPattern = /^-?\d+(?:\.\d+)?$/u;
const defaultMinorUnitExponent = 2;

/**
 * ISO 4217 currencies whose minor unit is not two digits.
 *
 * Only the exceptions are listed: two decimal places is the ISO default and holds for the
 * overwhelming majority, so enumerating every code would be a list to maintain rather than a
 * fact to record. A product currency outside ISO registers itself through
 * {@link Money.registerCurrency}.
 */
const isoExceptionalMinorUnitExponents = new Map<CurrencyCode, number>([
  ...(
    [
      'BIF',
      'CLP',
      'DJF',
      'GNF',
      'ISK',
      'JPY',
      'KMF',
      'KRW',
      'PYG',
      'RWF',
      'UGX',
      'UYI',
      'VND',
      'VUV',
      'XAF',
      'XOF',
      'XPF',
    ] as const
  ).map((code): [CurrencyCode, number] => [code, 0]),
  ...(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'] as const).map((code): [CurrencyCode, number] => [code, 3]),
  ...(['CLF', 'UYW'] as const).map((code): [CurrencyCode, number] => [code, 4]),
]);

const registeredCurrencyExponents = new Map<CurrencyCode, number>();

export class MoneyCurrencyMismatchError extends Error {
  constructor(
    readonly left: CurrencyCode,
    readonly right: CurrencyCode,
  ) {
    super(`Refusing to combine ${left} with ${right}: convert one side before doing arithmetic.`);
    this.name = 'MoneyCurrencyMismatchError';
  }
}

function assertCurrencyCode(code: string): CurrencyCode {
  if (!currencyCodePattern.test(code)) {
    throw new TypeError(`Currency must be three uppercase letters (received ${JSON.stringify(code)}).`);
  }
  return code;
}

/**
 * Declares a currency this workspace does not get from the ISO table — a crypto unit, a loyalty
 * point, an internal ledger unit. Registering the same exponent twice is a no-op so a module
 * that registers on import stays safe to import more than once; a conflicting exponent throws,
 * because one of the two callers is already computing with the wrong scale.
 */
function registerCurrency(definition: CurrencyDefinition): void {
  const code = assertCurrencyCode(definition.code);
  const { minorUnitExponent: exponent } = definition;

  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 12) {
    throw new RangeError(`${code} minor unit exponent must be a whole number between 0 and 12.`);
  }

  const existing = registeredCurrencyExponents.get(code);
  if (existing !== undefined && existing !== exponent) {
    throw new Error(`${code} is already registered with minor unit exponent ${existing}.`);
  }

  registeredCurrencyExponents.set(code, exponent);
}

/** Decimal places in the currency's minor unit. Registrations win over the ISO table. */
function minorUnitExponent(currency: CurrencyCode): number {
  const code = assertCurrencyCode(currency);

  return (
    registeredCurrencyExponents.get(code) ?? isoExceptionalMinorUnitExponents.get(code) ?? defaultMinorUnitExponent
  );
}

function of(amountMinor: number, currency: CurrencyCode): Money {
  const code = assertCurrencyCode(currency);

  if (!Number.isSafeInteger(amountMinor)) {
    throw new TypeError(`Money must be a whole number of minor units (received ${String(amountMinor)} ${code}).`);
  }

  return { amountMinor, currency: code };
}

function assertSameCurrency(left: Money, right: Money): CurrencyCode {
  if (left.currency !== right.currency) {
    throw new MoneyCurrencyMismatchError(left.currency, right.currency);
  }
  return left.currency;
}

function add(left: Money, right: Money): Money {
  return of(left.amountMinor + right.amountMinor, assertSameCurrency(left, right));
}

function subtract(left: Money, right: Money): Money {
  return of(left.amountMinor - right.amountMinor, assertSameCurrency(left, right));
}

/** `-1`, `0`, or `1`, so the result composes with `Array.prototype.sort`. */
function compare(left: Money, right: Money): -1 | 0 | 1 {
  assertSameCurrency(left, right);

  if (left.amountMinor < right.amountMinor) {
    return -1;
  }

  return left.amountMinor > right.amountMinor ? 1 : 0;
}

/**
 * Builds an exact ratio from decimal text: `Money.rate('0.075')` is 75/1000, not the nearest
 * double to 7.5%. Rates arrive as configuration or catalogue data, which is text; parsing it to
 * a float first is where the inexactness enters, so this never sees a float at all.
 */
function rate(decimalText: string): MoneyRatio {
  if (!decimalTextPattern.test(decimalText)) {
    throw new TypeError(`A rate must be decimal text such as "0.075" (received ${JSON.stringify(decimalText)}).`);
  }

  const [whole = '', fraction = ''] = decimalText.replace('-', '').split('.');
  const denominator = 10 ** fraction.length;
  const magnitude = Number(`${whole}${fraction}`);

  if (!Number.isSafeInteger(magnitude)) {
    throw new RangeError(`Rate ${decimalText} has more digits than can be represented exactly.`);
  }

  return { numerator: decimalText.startsWith('-') ? -magnitude : magnitude, denominator };
}

function toRatio(value: MoneyRate): MoneyRatio {
  if (typeof value !== 'number') {
    return value;
  }

  if (!Number.isSafeInteger(value)) {
    throw new TypeError(
      `A fractional rate must be exact: build it with Money.rate("${String(value)}") instead of passing a float.`,
    );
  }

  return { numerator: value, denominator: 1 };
}

function divideRounded(numerator: bigint, denominator: bigint, rounding: MoneyRounding): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n || rounding === 'trunc') {
    return quotient;
  }

  const sign = numerator < 0n ? -1n : 1n;
  const doubledRemainder = (remainder < 0n ? -remainder : remainder) * 2n;

  if (doubledRemainder !== denominator) {
    return doubledRemainder > denominator ? quotient + sign : quotient;
  }

  // Exactly half. Half-up biases every tie the same direction, so a schedule of many ties
  // drifts; half-even splits them and is the default for that reason.
  return rounding === 'half-up' || quotient % 2n !== 0n ? quotient + sign : quotient;
}

function toSafeMinorUnits(value: bigint, currency: CurrencyCode): Money {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`Result ${value.toString()} ${currency} is too large to represent exactly.`);
  }
  return of(Number(value), currency);
}

/**
 * Scales an amount by an integer or an exact ratio. The whole product is computed before any
 * rounding, so `price * 3 * Money.rate('0.075')` never rounds twice.
 */
function multiply(value: Money, factor: MoneyRate, rounding: MoneyRounding = 'half-even'): Money {
  const ratio = toRatio(factor);
  const denominator = BigInt(ratio.denominator);

  if (denominator <= 0n) {
    throw new RangeError('A rate denominator must be a positive whole number.');
  }

  const scaled = divideRounded(BigInt(value.amountMinor) * BigInt(ratio.numerator), denominator, rounding);
  return toSafeMinorUnits(scaled, value.currency);
}

/**
 * Splits an amount across weights so the parts sum back to the original exactly.
 *
 * Rounding each share independently loses or invents minor units — three ways of $10.00 rounds
 * to $9.99. The leftover units go to the earliest weights instead, which is arbitrary but
 * total-preserving, and being total-preserving is the property a ledger needs.
 */
function allocate(value: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) {
    throw new RangeError('Allocation needs at least one weight.');
  }
  if (weights.some((weight) => !Number.isSafeInteger(weight) || weight < 0)) {
    throw new RangeError('Allocation weights must be non-negative whole numbers.');
  }

  const weightSum = weights.reduce((total, weight) => total + weight, 0);
  if (weightSum === 0) {
    throw new RangeError('Allocation needs at least one weight above zero.');
  }

  const sign = value.amountMinor < 0 ? -1n : 1n;
  const magnitude = BigInt(Math.abs(value.amountMinor));
  const divisor = BigInt(weightSum);
  const shares = weights.map((weight) => ({ weight, share: (magnitude * BigInt(weight)) / divisor }));
  // Each floored share loses less than one minor unit and a zero weight loses nothing, so the
  // leftover is always smaller than the number of eligible shares: one pass is enough.
  let leftover = magnitude - shares.reduce((total, entry) => total + entry.share, 0n);

  for (const entry of shares) {
    if (leftover === 0n) {
      break;
    }

    if (entry.weight === 0) {
      continue;
    }

    entry.share += 1n;
    leftover -= 1n;
  }

  return shares.map((entry) => toSafeMinorUnits(entry.share * sign, value.currency));
}

/** Reads decimal text at the currency's own scale: `'12.34'` USD, `'1200'` JPY, `'0.001'` BHD. */
function parse(decimalText: string, currency: CurrencyCode): Money {
  const exponent = minorUnitExponent(currency);

  if (!decimalTextPattern.test(decimalText)) {
    throw new TypeError(`Expected decimal text such as "12.34" (received ${JSON.stringify(decimalText)}).`);
  }

  const negative = decimalText.startsWith('-');
  const [whole = '', fraction = ''] = decimalText.replace('-', '').split('.');

  if (fraction.length > exponent) {
    throw new RangeError(`${currency} amounts carry at most ${exponent} decimal places (received "${decimalText}").`);
  }

  const magnitude = BigInt(`${whole}${fraction.padEnd(exponent, '0')}`);
  return toSafeMinorUnits(negative ? -magnitude : magnitude, currency);
}

/** Exact decimal text at the currency's scale — the form to persist or put on the wire. */
function formatAmount(value: Money): string {
  const exponent = minorUnitExponent(value.currency);
  const digits = Math.abs(value.amountMinor)
    .toString()
    .padStart(exponent + 1, '0');
  const sign = value.amountMinor < 0 ? '-' : '';

  if (exponent === 0) {
    return `${sign}${digits}`;
  }

  return `${sign}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

/**
 * Renders an amount for a human. Display only — {@link Money.formatAmount} is the exact form;
 * this one goes through a double on its way to `Intl`, and locale rules may abbreviate.
 */
function format(value: Money, locale: string, options: Intl.NumberFormatOptions = {}): string {
  const exponent = minorUnitExponent(value.currency);

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: value.currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
    ...options,
  }).format(value.amountMinor / 10 ** exponent);
}

/**
 * Everything you can do with a {@link Money}.
 *
 * A namespace rather than loose exports: these names are meaningless without the noun in front
 * of them — `add` alone says nothing, `Money.add` says everything — and a call site that imports
 * one of them imports the vocabulary with it.
 */
export const Money = {
  of,
  add,
  subtract,
  compare,
  multiply,
  allocate,
  rate,
  parse,
  format,
  formatAmount,
  registerCurrency,
  minorUnitExponent,
} as const;
