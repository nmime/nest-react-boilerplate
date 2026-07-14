import { describe, expect, it } from 'vitest';
import { stripTrailingSlash } from './strip-trailing-slash.util';

describe('stripTrailingSlash', () => {
  it('removes a single trailing slash', () => {
    expect(stripTrailingSlash('https://umami.example.com/')).toBe('https://umami.example.com');
  });

  it('removes every consecutive trailing slash', () => {
    expect(stripTrailingSlash('https://umami.example.com///')).toBe('https://umami.example.com');
  });

  it('leaves values without a trailing slash untouched', () => {
    expect(stripTrailingSlash('https://umami.example.com')).toBe('https://umami.example.com');
  });

  it('collapses a string made only of slashes to empty', () => {
    expect(stripTrailingSlash('///')).toBe('');
  });

  it('returns an empty string unchanged', () => {
    expect(stripTrailingSlash('')).toBe('');
  });
});
