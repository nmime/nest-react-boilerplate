// @requirements REQ-API-RESPONSE-006
import { describe, expect, it } from 'vitest';
import { mergeVaryHeader, ProblemDetailsVaryHeaders } from './vary-header.util';

describe('mergeVaryHeader', () => {
  it('returns the problem-details negotiation dimensions when no header exists', () => {
    expect(mergeVaryHeader(undefined)).toBe(ProblemDetailsVaryHeaders.join(', '));
  });

  it('preserves existing dimensions and de-duplicates names case-insensitively', () => {
    expect(mergeVaryHeader('Origin, accept-language')).toBe('Origin, accept-language, X-Locale, X-Language, Cookie');
  });

  it('preserves the wildcard value because no additional field names may accompany it', () => {
    expect(mergeVaryHeader(['Origin', '*'])).toBe('*');
  });
});
