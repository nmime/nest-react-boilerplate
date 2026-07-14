import { describe, expect, it } from 'vitest';
import { type LocalizedText, randomLocalizedText } from './random-intl-text.util';

describe('randomLocalizedText', () => {
  it('resolves the selected localized value for the requested locale', () => {
    expect(randomLocalizedText([{ en: 'Hello', ru: 'Привет' }], 'ru')).toBe('Привет');
  });

  it('resolves a plain string value', () => {
    expect(randomLocalizedText(['only'], 'ru')).toBe('only');
  });

  it('returns an empty string for an empty pool', () => {
    expect(randomLocalizedText([], 'en')).toBe('');
  });

  it('returns an empty string when the selected entry is undefined', () => {
    expect(randomLocalizedText([undefined as unknown as LocalizedText], 'en')).toBe('');
  });

  it('only ever returns values drawn from the provided pool', () => {
    const pool: LocalizedText[] = [{ en: 'first' }, { en: 'second' }, { en: 'third' }];
    const allowed = new Set(['first', 'second', 'third']);
    const seen = new Set<string>();

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const value = randomLocalizedText(pool, 'en');
      expect(allowed.has(value)).toBe(true);
      seen.add(value);
    }

    expect(seen.size).toBeGreaterThan(1);
  });
});
