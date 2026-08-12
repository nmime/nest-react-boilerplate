// @requirements REQ-NOTIFY-PREFERENCE-006
import { describe, expect, it } from 'vitest';
import { getPayloadLocale, getPayloadTheme, readAuthPayloadField } from './session-payload';

const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

describe('readAuthPayloadField', () => {
  it('reads a field the shared payload types do not model, newest scope first', () => {
    expect(readAuthPayloadField({ emailVerified: true }, 'emailVerified', asBoolean)).toBe(true);
    expect(readAuthPayloadField({ user: { emailVerified: true } }, 'emailVerified', asBoolean)).toBe(true);
    expect(readAuthPayloadField({ profile: { emailVerified: false } }, 'emailVerified', asBoolean)).toBe(false);
    expect(readAuthPayloadField({ principal: { emailVerified: true } }, 'emailVerified', asBoolean)).toBe(true);
  });

  it('prefers the outermost scope that parses', () => {
    expect(
      readAuthPayloadField(
        { user: { emailVerified: true }, profile: { emailVerified: false } },
        'emailVerified',
        asBoolean,
      ),
    ).toBe(true);
  });

  it('returns undefined when no scope carries a value the parser accepts', () => {
    expect(readAuthPayloadField(undefined, 'emailVerified', asBoolean)).toBeUndefined();
    expect(readAuthPayloadField(null, 'emailVerified', asBoolean)).toBeUndefined();
    expect(readAuthPayloadField({}, 'emailVerified', asBoolean)).toBeUndefined();
    expect(readAuthPayloadField({ user: null }, 'emailVerified', asBoolean)).toBeUndefined();
    expect(readAuthPayloadField({ emailVerified: 'yes' }, 'emailVerified', asBoolean)).toBeUndefined();
  });
});

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
