// @requirements REQ-AUTH-PERSISTENCE-007
import { describe, expect, it } from 'vitest';
import { maxPageSize } from '../const/pagination.const';
import { normalizePageLimit, normalizePageOffset } from './pagination.util';

describe('normalizePageLimit', () => {
  it('falls back to the default page size for non-finite values', () => {
    expect(normalizePageLimit(undefined)).toBe(50);
    expect(normalizePageLimit(Number.NaN)).toBe(50);
    expect(normalizePageLimit(Number.POSITIVE_INFINITY)).toBe(50);
  });

  it('clamps finite values between one and the maximum page size', () => {
    expect(normalizePageLimit(0)).toBe(1);
    expect(normalizePageLimit(-25)).toBe(1);
    expect(normalizePageLimit(25.9)).toBe(25);
    expect(normalizePageLimit(1_000)).toBe(maxPageSize);
  });
});

describe('normalizePageOffset', () => {
  it('falls back to zero for non-finite values', () => {
    expect(normalizePageOffset(undefined)).toBe(0);
    expect(normalizePageOffset(Number.NaN)).toBe(0);
  });

  it('floors negative values to zero and truncates finite offsets', () => {
    expect(normalizePageOffset(-10)).toBe(0);
    expect(normalizePageOffset(42.7)).toBe(42);
  });
});
