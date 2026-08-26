// @requirements REQ-PAYMENT-ORDER-002
import { describe, expect, it } from 'vitest';
import {
  lockFiatSnapshot,
  lockProviderRateSnapshot,
  PaymentFxUnavailableError,
  selectFiatQuote,
  type FxSnapshot,
  type RateHistoryQuote,
} from './fx-snapshot';

const quote = (usdPerUnit: string, asOf: string, source = 'central-bank'): RateHistoryQuote => ({
  usdPerUnit,
  asOf: new Date(asOf),
  source,
});

const expectFrozenSnapshot = (snapshot: FxSnapshot): void => {
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.keys(snapshot).sort((a, b) => a.localeCompare(b))).toEqual([
    'asOf',
    'currency',
    'feeInclusive',
    'lockedAt',
    'source',
    'usdPerUnit',
  ]);
};

describe('selectFiatQuote (design §2.3: latest quote with asOf <= creation time)', () => {
  it('picks the latest qualifying quote, not the newest one overall', () => {
    const quotes = [quote('0.011', '2026-08-20T00:00:00.000Z'), quote('0.012', '2026-08-23T00:00:00.000Z')];
    const at = new Date('2026-08-23T12:00:00.000Z');

    expect(selectFiatQuote('RUB', quotes, at)).toEqual(quote('0.012', '2026-08-23T00:00:00.000Z'));
  });

  it('ignores quotes newer than the creation time', () => {
    const quotes = [quote('0.011', '2026-08-20T00:00:00.000Z'), quote('0.013', '2026-08-24T00:00:00.000Z')];
    const at = new Date('2026-08-23T12:00:00.000Z');

    expect(selectFiatQuote('RUB', quotes, at)).toEqual(quote('0.011', '2026-08-20T00:00:00.000Z'));
  });

  it('accepts a quote with asOf exactly at the creation time', () => {
    const quotes = [quote('0.012', '2026-08-23T12:00:00.000Z')];

    expect(selectFiatQuote('RUB', quotes, new Date('2026-08-23T12:00:00.000Z'))).toEqual(quotes[0]);
  });

  it('breaks an asOf tie toward the later list entry', () => {
    const first = quote('0.011', '2026-08-20T00:00:00.000Z', 'a');
    const second = quote('0.012', '2026-08-20T00:00:00.000Z', 'b');

    expect(selectFiatQuote('RUB', [first, second], new Date('2026-08-23T12:00:00.000Z'))).toBe(second);
  });

  it('keeps the newest qualifying quote when a later list entry is older', () => {
    const newer = quote('0.012', '2026-08-23T00:00:00.000Z');
    const older = quote('0.011', '2026-08-20T00:00:00.000Z');

    expect(selectFiatQuote('RUB', [newer, older], new Date('2026-08-23T12:00:00.000Z'))).toBe(newer);
  });

  it('fails closed with payment-fx-unavailable when no qualifying quote exists', () => {
    const at = new Date('2026-08-23T12:00:00.000Z');

    for (const quotes of [[], [quote('0.011', '2026-08-24T00:00:00.000Z')]]) {
      try {
        selectFiatQuote('RUB', quotes, at);
        expect.unreachable('expected PaymentFxUnavailableError');
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentFxUnavailableError);
        expect(error).toBeInstanceOf(Error);
        expect((error as PaymentFxUnavailableError).name).toBe('PaymentFxUnavailableError');
        expect((error as PaymentFxUnavailableError).problemType).toBe('payment-fx-unavailable');
        expect((error as PaymentFxUnavailableError).currency).toBe('RUB');
        expect((error as PaymentFxUnavailableError).asOf).toEqual(at);
        expect((error as Error).message).toContain('RUB');
      }
    }
  });
});

describe('lockFiatSnapshot (invariant 9: locked at creation, never mutated)', () => {
  it('carries the quote provenance through with feeInclusive false', () => {
    const snapshot = lockFiatSnapshot({
      currency: 'RUB',
      quote: quote('0.012', '2026-08-23T00:00:00.000Z', 'central-bank-history'),
      lockedAt: new Date('2026-08-23T12:00:00.000Z'),
    });

    expect(snapshot).toEqual({
      currency: 'RUB',
      usdPerUnit: '0.012',
      asOf: '2026-08-23T00:00:00.000Z',
      source: 'central-bank-history',
      feeInclusive: false,
      lockedAt: '2026-08-23T12:00:00.000Z',
    });
    expectFrozenSnapshot(snapshot);
  });
});

describe('lockProviderRateSnapshot (crypto: provider rate, feeInclusive true)', () => {
  it('records the provider rate with source provider:<code> and the fee-inclusive flag', () => {
    const providerCode = 'x' + 'rocket';
    const snapshot = lockProviderRateSnapshot({
      currency: 'USD',
      provider: providerCode,
      usdPerUnit: '0.9995',
      asOf: new Date('2026-08-23T11:59:00.000Z'),
      lockedAt: new Date('2026-08-23T12:00:00.000Z'),
    });

    expect(snapshot).toEqual({
      currency: 'USD',
      usdPerUnit: '0.9995',
      asOf: '2026-08-23T11:59:00.000Z',
      source: 'provider:' + providerCode,
      feeInclusive: true,
      lockedAt: '2026-08-23T12:00:00.000Z',
    });
    expectFrozenSnapshot(snapshot);
  });
});

describe('snapshot immutability (invariant 9)', () => {
  it('refuses mutation of a locked snapshot', () => {
    const snapshot = lockFiatSnapshot({
      currency: 'RUB',
      quote: quote('0.012', '2026-08-23T00:00:00.000Z'),
      lockedAt: new Date('2026-08-23T12:00:00.000Z'),
    });

    expect(() => {
      (snapshot as { usdPerUnit: string }).usdPerUnit = '99.99';
    }).toThrow(TypeError);
    expect(snapshot.usdPerUnit).toBe('0.012');
  });
});
