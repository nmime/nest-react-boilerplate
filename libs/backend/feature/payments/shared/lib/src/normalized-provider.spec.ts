// @requirements REQ-PAYMENT-ORDER-001 REQ-PAYMENT-ORDER-004
import { describe, expect, it } from 'vitest';
import {
  isNormalizedProviderStatus,
  isProviderHttpError,
  isProviderHttpErrorClass,
  NormalizedProviderStatuses,
  ProviderHttpError,
  ProviderHttpErrorClasses,
  type NormalizedWebhookEvent,
} from './normalized-provider';

describe('normalized provider vocabulary (design §4.0)', () => {
  it('has exactly the eight normalized statuses', () => {
    expect([...NormalizedProviderStatuses]).toEqual([
      'pending',
      'processing',
      'paid',
      'failed',
      'cancelled',
      'expired',
      'underpaid',
      'aml_hold',
    ]);
    for (const status of NormalizedProviderStatuses) {
      expect(isNormalizedProviderStatus(status)).toBe(true);
    }
    for (const unknown of ['partially_paid', 'UNKNOWN', '']) {
      expect(isNormalizedProviderStatus(unknown)).toBe(false);
    }
  });

  it('carries the provider fact, not the payment state: underpaid and aml_hold are facts the machine maps', () => {
    const event: NormalizedWebhookEvent = {
      paymentIdHint: '123e4567-e89b-12d3-a456-426614174000',
      providerStatusRaw: 'partially_paid',
      paidAmount: '4.00',
      paidCurrency: 'USD',
      txid: 'tx_2',
      finalizedAt: new Date('2026-08-24T00:06:00.000Z'),
      eventTime: new Date('2026-08-24T00:06:01.000Z'),
    };

    expect(event.paymentIdHint).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(event.paidAmount).toBe('4.00');

    const minimal: NormalizedWebhookEvent = { providerStatusRaw: 'expired' };
    expect(minimal.paymentIdHint).toBeUndefined();
  });
});

describe('ProviderHttpError (design §4.0 error wrapper)', () => {
  it('carries all six failure classes', () => {
    expect([...ProviderHttpErrorClasses]).toEqual(['auth', 'client', 'server', 'rate_limited', 'timeout', 'network']);
    for (const cls of ProviderHttpErrorClasses) {
      expect(isProviderHttpErrorClass(cls)).toBe(true);
    }
    expect(isProviderHttpErrorClass('unknown')).toBe(false);
  });

  it('is a typed error with the design field set', () => {
    const error = new ProviderHttpError('auth', 'provider rejected the bearer token', {
      providerStatus: 401,
      problemType: 'payment-provider-credential-invalid',
      retryable: false,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ProviderHttpError);
    expect(isProviderHttpError(error)).toBe(true);
    expect(error.name).toBe('ProviderHttpError');
    expect(error.message).toBe('provider rejected the bearer token');
    expect(error.class).toBe('auth');
    expect(error.detail).toBe('provider rejected the bearer token');
    expect(error.providerStatus).toBe(401);
    expect(error.problemType).toBe('payment-provider-credential-invalid');
    expect(error.retryable).toBe(false);
    expect(error.retryAfterSeconds).toBeUndefined();
  });

  it('leaves optional fields absent when the caller has none', () => {
    const error = new ProviderHttpError('network', 'socket hang up', { retryable: true, retryAfterSeconds: 3 });

    expect(error.class).toBe('network');
    expect(error.providerStatus).toBeUndefined();
    expect(error.problemType).toBeUndefined();
    expect(error.retryable).toBe(true);
    expect(error.retryAfterSeconds).toBe(3);
  });

  it('rejects values that are not provider HTTP errors', () => {
    expect(isProviderHttpError(new Error('nope'))).toBe(false);
    expect(isProviderHttpError('nope')).toBe(false);
    expect(isProviderHttpError(null)).toBe(false);
  });
});
