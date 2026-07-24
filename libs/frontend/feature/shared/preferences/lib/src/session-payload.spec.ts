import { describe, expect, it } from 'vitest';
import { getPayloadLocale, getPayloadTheme } from './session-payload';

describe('getPayloadLocale', () => {
  it('prefers direct, then user, profile, and principal locales', () => {
    expect(getPayloadLocale({ locale: 'en' })).toBe('en');
    expect(getPayloadLocale({ user: { locale: 'ru' } })).toBe('ru');
    expect(getPayloadLocale({ profile: { locale: 'en' } })).toBe('en');
    expect(getPayloadLocale({ principal: { locale: 'ru' } })).toBe('ru');
  });

  it('returns undefined for empty or missing payloads', () => {
    expect(getPayloadLocale()).toBeUndefined();
    expect(getPayloadLocale(null)).toBeUndefined();
    expect(getPayloadLocale({})).toBeUndefined();
  });
});

describe('getPayloadTheme', () => {
  it('reads and normalizes the theme from payload, user, profile, and principal', () => {
    expect(getPayloadTheme({ theme: 'dark' })).toBe('dark');
    expect(getPayloadTheme({ user: { theme: 'light' } })).toBe('light');
    expect(getPayloadTheme({ profile: { theme: 'system' } })).toBe('system');
    expect(getPayloadTheme({ principal: { theme: 'dark' } })).toBe('dark');
  });

  it('returns undefined for missing or non-string themes', () => {
    expect(getPayloadTheme()).toBeUndefined();
    expect(getPayloadTheme({})).toBeUndefined();
    expect(getPayloadTheme({ theme: 123 as unknown as string })).toBeUndefined();
  });
});
