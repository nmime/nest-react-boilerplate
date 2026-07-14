import { describe, expect, it } from 'vitest';
import {
  assertReturnUrlAllowed,
  isPathWithinBoundary,
  isReturnUrlAllowed,
  normalizeReturnUrlHost,
  parseAbsoluteUrl,
} from './return-url.util';

describe('return URL utilities', () => {
  it('accepts empty return URLs and rejects when no allowlist is configured', () => {
    expect(() => {
      assertReturnUrlAllowed();
    }).not.toThrow();
    delete process.env.AUTH_ALLOWED_RETURN_URLS;

    expect(() => {
      assertReturnUrlAllowed('https://app.example.test/after');
    }).toThrow('return_url_not_allowed');
  });

  it('normalizes hosts, validates ports and paths, and handles malformed allowlist entries', () => {
    expect(parseAbsoluteUrl('not a url')).toBeUndefined();
    expect(normalizeReturnUrlHost(new URL('https://APP.example.test./path'))).toBe('app.example.test');
    expect(isReturnUrlAllowed('https://app.example.test:444/app/next', ['https://app.example.test:444/app'])).toBe(
      true,
    );
    expect(isReturnUrlAllowed('https://app.example.test:445/app/next', ['https://app.example.test:444/app'])).toBe(
      false,
    );
    expect(isReturnUrlAllowed('http://app.example.test/app/next', ['https://app.example.test/app'])).toBe(false);
    expect(isReturnUrlAllowed('https://app.example.test/app', ['not a url'])).toBe(false);
    expect(isPathWithinBoundary('/app', '/app/')).toBe(true);
  });
});
