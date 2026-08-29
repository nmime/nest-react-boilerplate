import { Money, type CurrencyCode, type Money as MoneyValue } from '@app/common-money';

/**
 * The payments domain's money boundary (design §2.2).
 *
 * The only file in the domain that parses provider decimal strings into
 * common-money values and formats values back for provider requests. Amounts
 * cross this file as decimal strings; arithmetic happens in exact minor
 * units. No float anywhere in the domain: callers and tests use decimal text
 * or whole minor units only, and minor-unit conversion for Stripe/Adyen-style
 * integer amounts divides by 10^exponent inside common-money, never via
 * `Number` / `parseFloat`.
 */

/** Parse a provider decimal string at the currency's minor-unit scale (exact). */
export function parsePaymentAmount(decimalText: string, currency: CurrencyCode): MoneyValue {
  return Money.parse(decimalText, currency);
}

/** The exact decimal text of a value — the form persisted and put on the wire. */
export function formatPaymentAmount(value: MoneyValue): string {
  return Money.formatAmount(value);
}

/**
 * Whole minor units a fiat provider sends as an integer (Stripe, Adyen) to
 * an exact value (design §2.2).
 */
export function paymentAmountFromMinorUnits(amountMinor: number, currency: CurrencyCode): MoneyValue {
  return Money.of(amountMinor, currency);
}

/** The exact wire string for whole minor units — no float on the path. */
export function decimalTextFromMinorUnits(amountMinor: number, currency: CurrencyCode): string {
  return Money.formatAmount(Money.of(amountMinor, currency));
}

/**
 * Add two amounts (invariant 4). Cross-currency addition throws
 * `MoneyCurrencyMismatchError` — convert one side before doing arithmetic.
 */
export function addPaymentAmounts(left: MoneyValue, right: MoneyValue): MoneyValue {
  return Money.add(left, right);
}

/** True when the refund does not exceed the amount (invariant 7, checked with common-money). */
export function isRefundWithinAmount(refunded: MoneyValue, amount: MoneyValue): boolean {
  return Money.compare(refunded, amount) <= 0;
}

/**
 * Declare a non-ISO unit (a crypto asset, a ledger unit) at its wire scale so
 * {@link parsePaymentAmount} accepts its decimal places. Registering the same
 * code again with the same exponent is a no-op; a conflicting exponent throws.
 */
export function registerPaymentCurrency(code: CurrencyCode, minorUnitExponent: number): void {
  Money.registerCurrency({ code, minorUnitExponent });
}
