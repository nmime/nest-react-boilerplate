import { describe, expect, it } from 'vitest';
import { ProtectedLoggerFields, RedactedValue } from './logger-fields.const';

describe('logger-fields.const', () => {
  it('exposes the redaction placeholder value', () => {
    expect(RedactedValue).toBe('[redacted]');
  });

  it('lists sensitive field names as a non-empty tuple', () => {
    expect(Array.isArray(ProtectedLoggerFields)).toBe(true);
    expect(ProtectedLoggerFields.length).toBeGreaterThan(0);
  });

  it('covers the well-known credential-bearing field names', () => {
    expect(ProtectedLoggerFields).toEqual(
      expect.arrayContaining([
        'authorization',
        'cookie',
        'set-cookie',
        'password',
        'token',
        'refresh_token',
        'x-api-key',
        'secret',
        'private_key',
        'session',
        'csrf',
      ]),
    );
  });

  it('keeps every field name lowercase and free of whitespace', () => {
    for (const field of ProtectedLoggerFields) {
      expect(field).toBe(field.toLowerCase());
      expect(field).not.toMatch(/\s/);
    }
  });

  it('contains no duplicate field names', () => {
    expect(new Set(ProtectedLoggerFields).size).toBe(ProtectedLoggerFields.length);
  });
});
