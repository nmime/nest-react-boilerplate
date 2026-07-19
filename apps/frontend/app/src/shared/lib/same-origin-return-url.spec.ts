import { describe, expect, it } from 'vitest';
import { toAbsoluteSameOriginReturnUrl, toSameOriginReturnPath } from './same-origin-return-url';

const origin = 'https://app.example.test';

describe('same-origin return URL utilities', () => {
  it('converts safe application paths to absolute same-origin URLs', () => {
    expect(toAbsoluteSameOriginReturnUrl('/', origin)).toBe('https://app.example.test/');
    expect(toAbsoluteSameOriginReturnUrl('/settings?tab=auth#telegram', origin)).toBe(
      'https://app.example.test/settings?tab=auth#telegram',
    );
    expect(toAbsoluteSameOriginReturnUrl('https://app.example.test/profile', origin)).toBe(
      'https://app.example.test/profile',
    );
  });

  it('normalizes returned URLs back to safe router paths', () => {
    expect(toSameOriginReturnPath('https://app.example.test/', origin)).toBe('/');
    expect(toSameOriginReturnPath('https://app.example.test/settings?tab=auth#telegram', origin)).toBe(
      '/settings?tab=auth#telegram',
    );
    expect(toSameOriginReturnPath('/profile', origin)).toBe('/profile');
  });

  it.each([
    'https://evil.example.test/',
    'https://user:password@app.example.test/',
    'javascript:alert(document.domain)',
    '//evil.example.test/profile',
    'https://app.example.test//evil.example.test/profile',
    'not a url',
  ])('rejects unsafe return URL %s', (value) => {
    expect(toAbsoluteSameOriginReturnUrl(value, origin)).toBeUndefined();
    expect(toSameOriginReturnPath(value, origin)).toBeNull();
  });
});
