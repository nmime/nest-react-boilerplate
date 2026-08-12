// @requirements REQ-API-VALIDATION-004
import { describe, expect, it } from 'vitest';
import { ClientDataValidationException } from './exception';
import {
  IdempotencyKeyHeader,
  IdempotencyKeyMaxLength,
  IdempotencyKeyMinLength,
  idempotencyKeyPattern,
  isIdempotencyKey,
  requireIdempotencyKey,
} from './idempotency';

describe('isIdempotencyKey', () => {
  it('accepts the documented key alphabet', () => {
    expect(isIdempotencyKey('order:1234_5678-abcd')).toBe(true);
  });

  it('rejects keys shorter than the minimum length', () => {
    expect(isIdempotencyKey('a'.repeat(IdempotencyKeyMinLength - 1))).toBe(false);
  });

  it('rejects keys longer than the maximum length', () => {
    expect(isIdempotencyKey('a'.repeat(IdempotencyKeyMaxLength + 1))).toBe(false);
  });

  it('rejects characters outside the alphabet', () => {
    expect(isIdempotencyKey('order/1234-5678')).toBe(false);
  });

  it('is anchored so an embedded newline cannot smuggle a valid key', () => {
    expect(idempotencyKeyPattern.test('order-12345678\nevil')).toBe(false);
  });
});

describe('requireIdempotencyKey', () => {
  it('returns the header value when it is a valid key', () => {
    expect(requireIdempotencyKey('order-12345678')).toBe('order-12345678');
  });

  it('rejects a missing header as a client validation problem', () => {
    expect(() => requireIdempotencyKey(undefined)).toThrow(ClientDataValidationException);
  });

  it('points at the header member so the caller knows what to fix', () => {
    try {
      requireIdempotencyKey('short');
      expect.unreachable('requireIdempotencyKey should reject an invalid key');
    } catch (error) {
      expect(error).toBeInstanceOf(ClientDataValidationException);
      expect((error as ClientDataValidationException).extensions).toEqual({
        errors: [{ detail: `${IdempotencyKeyHeader} header is not a valid idempotency key.`, pointer: '#/headers/idempotency-key' }],
      });
    }
  });

  it('rejects a repeated header rather than picking one of the values', () => {
    expect(() => requireIdempotencyKey(['order-12345678', 'order-87654321'])).toThrow(ClientDataValidationException);
  });
});
