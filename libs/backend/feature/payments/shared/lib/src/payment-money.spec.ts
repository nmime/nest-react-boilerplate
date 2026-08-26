// @requirements REQ-PAYMENT-ORDER-002
import { MoneyCurrencyMismatchError } from '@app/common-money';
import { describe, expect, it } from 'vitest';
import {
  addPaymentAmounts,
  decimalTextFromMinorUnits,
  formatPaymentAmount,
  isRefundWithinAmount,
  parsePaymentAmount,
  paymentAmountFromMinorUnits,
  registerPaymentCurrency,
} from './payment-money';

/**
 * No float anywhere in the domain (design §2.2): every fixture below is
 * decimal text or whole minor units, and the discipline tests pin the exact
 * values a float path would get wrong.
 */
describe('payment-money boundary (design §2.2)', () => {
  it('parses and formats decimal strings at the currency scale, round-trip exact', () => {
    expect(parsePaymentAmount('10.00', 'USD')).toEqual({ amountMinor: 1000, currency: 'USD' });
    expect(formatPaymentAmount(parsePaymentAmount('10.00', 'USD'))).toBe('10.00');
    expect(formatPaymentAmount(parsePaymentAmount('10', 'USD'))).toBe('10.00');
    expect(formatPaymentAmount(parsePaymentAmount('0', 'USD'))).toBe('0.00');
  });

  it('honors zero and three-decimal currencies without a float on the path', () => {
    expect(parsePaymentAmount('1200', 'JPY')).toEqual({ amountMinor: 1200, currency: 'JPY' });
    expect(formatPaymentAmount(parsePaymentAmount('1200', 'JPY'))).toBe('1200');
    expect(parsePaymentAmount('0.001', 'BHD')).toEqual({ amountMinor: 1, currency: 'BHD' });
    expect(formatPaymentAmount(parsePaymentAmount('0.001', 'BHD'))).toBe('0.001');
  });

  it('rejects decimal text that cannot be represented exactly', () => {
    expect(() => parsePaymentAmount('12.345', 'USD')).toThrow(RangeError);
    expect(() => parsePaymentAmount('1200.5', 'JPY')).toThrow(RangeError);
    expect(() => parsePaymentAmount('not-amount', 'USD')).toThrow(TypeError);
    expect(() => parsePaymentAmount('10.00', 'usd')).toThrow(TypeError);
  });

  it('registers non-ISO units at their wire scale; a conflicting exponent throws', () => {
    registerPaymentCurrency('BTC', 8);
    expect(parsePaymentAmount('0.00000001', 'BTC')).toEqual({ amountMinor: 1, currency: 'BTC' });
    expect(formatPaymentAmount(parsePaymentAmount('0.00000001', 'BTC'))).toBe('0.00000001');

    expect(() => {
      registerPaymentCurrency('BTC', 8);
    }).not.toThrow();
    expect(() => {
      registerPaymentCurrency('BTC', 6);
    }).toThrow(/already registered/);
  });

  it('converts fiat providers integer minor units exactly, never via Number/parseFloat', () => {
    expect(paymentAmountFromMinorUnits(12345, 'USD')).toEqual({ amountMinor: 12345, currency: 'USD' });
    expect(decimalTextFromMinorUnits(12345, 'USD')).toBe('123.45');
    expect(decimalTextFromMinorUnits(1200, 'JPY')).toBe('1200');
    expect(decimalTextFromMinorUnits(1, 'BHD')).toBe('0.001');
  });

  it('adds same-currency amounts in minor units and refuses cross-currency (invariant 4)', () => {
    const sum = addPaymentAmounts(parsePaymentAmount('10.00', 'USD'), parsePaymentAmount('0.30', 'USD'));
    expect(sum).toEqual({ amountMinor: 1030, currency: 'USD' });

    expect(() => addPaymentAmounts(parsePaymentAmount('10.00', 'USD'), parsePaymentAmount('10.00', 'EUR'))).toThrow(
      MoneyCurrencyMismatchError,
    );
  });

  it('is exact where the classic float path is not: 0.1 + 0.2 is 0.30, not 0.30000000000000004', () => {
    const sum = addPaymentAmounts(parsePaymentAmount('0.1', 'USD'), parsePaymentAmount('0.2', 'USD'));
    expect(sum.amountMinor).toBe(30);
    expect(formatPaymentAmount(sum)).toBe('0.30');
    expect(Number('0.1') + Number('0.2')).not.toBe(Number('0.3'));
  });

  it('bounds refunds to the amount with common-money (invariant 7)', () => {
    const amount = parsePaymentAmount('10.00', 'USD');

    expect(isRefundWithinAmount(parsePaymentAmount('10.00', 'USD'), amount)).toBe(true);
    expect(isRefundWithinAmount(parsePaymentAmount('4.00', 'USD'), amount)).toBe(true);
    expect(isRefundWithinAmount(parsePaymentAmount('10.01', 'USD'), amount)).toBe(false);
    expect(() => isRefundWithinAmount(parsePaymentAmount('10.00', 'EUR'), amount)).toThrow(MoneyCurrencyMismatchError);
  });
});
