import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRecentAuthTime, readPositiveInt } from './external-auth.util';

describe('external auth configuration utilities', () => {
  afterEach(() => {
    delete process.env.EXTERNAL_AUTH_STEP_UP_MAX_AGE_SECONDS;
    vi.useRealTimers();
  });

  it('accepts only canonical positive integer configuration', () => {
    expect(readPositiveInt(' 30 ', 10)).toBe(30);
    expect(readPositiveInt('30seconds', 10)).toBe(10);
    expect(readPositiveInt('9007199254740992', 10)).toBe(10);
    expect(readPositiveInt('0', 10)).toBe(10);
  });

  it('accepts recent past authentication and rejects future or malformed times', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00.000Z'));
    const now = Math.floor(Date.now() / 1000);
    process.env.EXTERNAL_AUTH_STEP_UP_MAX_AGE_SECONDS = '60';

    expect(isRecentAuthTime(now - 60)).toBe(true);
    expect(isRecentAuthTime(now - 61)).toBe(false);
    expect(isRecentAuthTime(now + 1)).toBe(false);
    expect(isRecentAuthTime(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isRecentAuthTime(undefined)).toBe(false);
  });
});
