// @requirements REQ-FRONTEND-I18N-002
import { describe, expect, it } from 'vitest';
import type { Locale } from './runtime';
import {
  Language,
  buildLocaleTranslations,
  defaultLocale,
  getLocalization,
  hasTranslationKeyIn,
  interpolate,
  isLanguage,
  isSupportedLocale,
  languageKey,
  localeCandidates,
  localeDisplayName,
  localeFallbackChain,
  localeLabel,
  matchLocale,
  mergeLocaleCatalogFiles,
  toBcp47,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLanguage,
  resolveLanguageFromHeaders,
  resolveLanguageFromRequest,
  resolveLocale,
  resolveLocaleFromHeaders,
  resolveLocaleFromRequest,
  supportedLocales,
  translateFromCatalog,
} from './runtime';

type CatalogKey = 'greeting' | 'only';

const catalog: Record<Locale, Partial<Record<CatalogKey, string>>> = {
  en: { greeting: 'Hello {{ name }}', only: 'English only' },
  ru: { greeting: 'Привет {{ name }}' },
};

describe('locale catalog surface', () => {
  it('exposes the supported set and its dot-accessible language map', () => {
    expect(supportedLocales).toEqual(['en', 'ru']);
    expect(defaultLocale).toBe('en');
    expect(Language.En).toBe('en');
    expect(Language.Ru).toBe('ru');
  });

  it('recognizes supported locales and rejects everything else', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('fr')).toBe(false);
    expect(isSupportedLocale(7)).toBe(false);
    expect(isLanguage('ru')).toBe(true);
  });

  it('builds one catalog per locale from a generated file registry', () => {
    expect(
      buildLocaleTranslations({
        en: [['common/shared.json', { a: '1' }]],
        ru: [
          ['common/shared.json', { a: 'а' }],
          ['common/errors.json', { b: 'б' }],
        ],
      }),
    ).toEqual({ en: { a: '1' }, ru: { a: 'а', b: 'б' } });
  });

  it('merges catalog files and refuses duplicate keys', () => {
    expect(
      mergeLocaleCatalogFiles('en', [
        ['common/shared.json', { a: '1' }],
        ['common/errors.json', { b: '2' }],
      ]),
    ).toEqual({ a: '1', b: '2' });
    expect(() =>
      mergeLocaleCatalogFiles('en', [
        ['common/shared.json', { a: '1' }],
        ['common/errors.json', { a: '2' }],
      ]),
    ).toThrow('Duplicate i18n key a while merging en/common/errors.json');
  });

  // A bundler that rewrites a JSON import into a placeholder hands this a string, and
  // `Object.entries` on a string yields character indices — so the merge used to fail on the
  // second file with "Duplicate i18n key 0", which names neither the real cause nor the file that
  // was never loaded. The catalog's shape is checked before its keys so the message points at it.
  it('names the file whose catalog did not load as an object', () => {
    expect(() =>
      mergeLocaleCatalogFiles('en', [
        ['common/shared.json', 'import:@app/i18n-en-common/shared.json:default' as never],
      ]),
    ).toThrow('i18n catalog en/common/shared.json is a string, not an object: it was not loaded as JSON');
  });

  // `typeof null` is `'object'`, so a null catalog is the one shape that walks past a bare typeof
  // check and dies inside `Object.entries` instead — with a TypeError naming neither the locale nor
  // the file. The shape description special-cases it so this failure reads like the others.
  it('names a null catalog rather than failing inside the key walk', () => {
    expect(() => mergeLocaleCatalogFiles('en', [['common/shared.json', null as never]])).toThrow(
      'i18n catalog en/common/shared.json is a null, not an object: it was not loaded as JSON',
    );
  });

  // An array is the other shape `typeof` calls an object, and `Object.entries` walks it happily —
  // yielding numeric indices that merge as keys and collide across files.
  it('names an array catalog rather than merging its indices', () => {
    expect(() => mergeLocaleCatalogFiles('en', [['common/shared.json', [] as never]])).toThrow(
      'i18n catalog en/common/shared.json is a array, not an object: it was not loaded as JSON',
    );
  });
});

describe('locale candidate expansion', () => {
  it('normalizes every underscore, not just the first', () => {
    expect(localeCandidates('uz_Cyrl_UZ')[0]).toBe('uz-cyrl-uz');
  });

  it('offers each progressively shorter subtag so a script-qualified locale can match', () => {
    expect(localeCandidates('uz-Cyrl-UZ')).toEqual(['uz-cyrl-uz', 'uz-cyrl', 'uz']);
  });

  it('returns nothing for absent or blank input', () => {
    expect(localeCandidates(undefined)).toEqual([]);
    expect(localeCandidates(null)).toEqual([]);
    expect(localeCandidates('   ')).toEqual([]);
    expect(localeCandidates('-')).toEqual([]);
  });
});

describe('matchLocale', () => {
  it('resolves a script-qualified locale to the script-qualified entry, not the bare language', () => {
    expect(matchLocale('uz-Cyrl-UZ', ['uz', 'uz-Cyrl'])).toBe('uz-Cyrl');
  });

  it('falls back to the bare language when no script entry is declared', () => {
    expect(matchLocale('uz-Cyrl-UZ', ['en', 'uz'])).toBe('uz');
  });

  it('matches declared locales regardless of the casing a client sends', () => {
    expect(matchLocale('PT-br', ['en', 'pt-BR'])).toBe('pt-BR');
  });

  it('keeps the first declaration when a set repeats a locale in another casing', () => {
    expect(matchLocale('pt-br', ['pt-BR', 'pt-br'])).toBe('pt-BR');
  });

  it('returns undefined when nothing matches', () => {
    expect(matchLocale('fr-CA', ['en', 'ru'])).toBeUndefined();
    expect(matchLocale(undefined, ['en'])).toBeUndefined();
  });
});

describe('languageKey', () => {
  it('produces a dot-accessible identifier for a hyphenated locale', () => {
    expect(languageKey('uz-Cyrl')).toBe('UzCyrl');
    expect(languageKey('pt-br')).toBe('PtBr');
  });

  it('leaves a bare language capitalized', () => {
    expect(languageKey('en')).toBe('En');
  });
});

describe('localeFallbackChain', () => {
  it('walks the sibling script before the terminal fallback', () => {
    expect(localeFallbackChain('uz-Cyrl-UZ', { supported: ['en', 'uz', 'uz-Cyrl'] })).toEqual(['uz-Cyrl', 'uz', 'en']);
  });

  it('drops to the terminal fallback when nothing in the ladder is declared', () => {
    expect(localeFallbackChain('fr-CA', { supported: ['en', 'ru'] })).toEqual(['en']);
  });

  it('honors a declared relation that subtag truncation cannot express', () => {
    expect(localeFallbackChain('be', { supported: ['en', 'ru', 'be'], overrides: { be: ['ru'] } })).toEqual([
      'be',
      'ru',
      'en',
    ]);
  });

  it('defaults to the workspace locale set and never repeats an entry', () => {
    expect(localeFallbackChain('ru-RU')).toEqual(['ru', 'en']);
    expect(localeFallbackChain('en')).toEqual(['en']);
  });

  it('accepts a configured terminal fallback, or none at all', () => {
    expect(localeFallbackChain('fr', { supported: ['en', 'ru'], fallbackLocale: 'ru' })).toEqual(['ru']);
    expect(localeFallbackChain('ru', { fallbackLocale: null })).toEqual(['ru']);
  });
});

describe('toBcp47', () => {
  it('canonicalizes subtag casing so external consumers get a well-formed tag', () => {
    expect(toBcp47('uz-cyrl')).toBe('uz-Cyrl');
    expect(toBcp47('PT_br')).toBe('pt-BR');
    expect(toBcp47('en')).toBe('en');
  });

  it('keeps numeric regions and lowercases variants', () => {
    expect(toBcp47('ES-419')).toBe('es-419');
    expect(toBcp47('ca-es-VALENCIA')).toBe('ca-ES-valencia');
  });
});

describe('locale labels', () => {
  it('renders the endonym instead of an uppercased tag', () => {
    expect(localeDisplayName('en')).toBe('English');
    expect(localeLabel('en')).toBe('English');
  });

  it('renders a locale in the requested display language', () => {
    expect(localeDisplayName('ru', 'ru')).toMatch(/^[А-Яа-я]/u);
  });

  it('prefers a catalog override and otherwise degrades to the canonical tag', () => {
    expect(localeLabel('ru', { override: 'Russian (product wording)' })).toBe('Russian (product wording)');
    expect(localeLabel('zz-qqqq')).toBe('zz-Qqqq');
  });

  it('degrades instead of throwing where the runtime has no display data', () => {
    expect(localeDisplayName('!')).toBeUndefined();
    expect(localeLabel('!')).toBe('!');
  });
});

describe('normalizeLocale', () => {
  it('resolves regional and underscore-separated tags against the supported set', () => {
    expect(normalizeLocale('ru-RU')).toBe('ru');
    expect(normalizeLocale('en_US_POSIX')).toBe('en');
    expect(normalizeLocale('fr')).toBeUndefined();
    expect(normalizeLocale('')).toBeUndefined();
  });
});

describe('getLocalization', () => {
  it('returns nothing without a localization record', () => {
    expect(getLocalization(null)).toBeUndefined();
    expect(getLocalization(undefined, 'en')).toBeUndefined();
  });

  it('prefers the requested locale, then the default, then an explicit default entry', () => {
    expect(getLocalization({ en: 'Hello', ru: 'Привет' }, 'ru-RU')).toBe('Привет');
    expect(getLocalization({ en: 'Hello' }, 'fr')).toBe('Hello');
    expect(getLocalization({ default: 'Fallback' }, 'fr')).toBe('Fallback');
  });

  it('falls back to any supported locale before giving up', () => {
    expect(getLocalization({ ru: 'Привет' }, 'en')).toBe('Привет');
    expect(getLocalization({ fr: 'Bonjour' }, 'en')).toBeUndefined();
  });

  it('prefers the sibling script over the default locale', () => {
    expect(getLocalization({ en: 'Hello', uz: 'Salom', 'uz-cyrl': 'Салом' }, 'uz-Cyrl-UZ')).toBe('Салом');
    expect(getLocalization({ en: 'Hello', uz: 'Salom' }, 'uz-Cyrl-UZ')).toBe('Salom');
  });
});

describe('parseAcceptLanguage', () => {
  it('returns nothing for an absent header', () => {
    expect(parseAcceptLanguage(undefined)).toBeUndefined();
    expect(parseAcceptLanguage('')).toBeUndefined();
  });

  it('picks the highest quality supported locale, breaking ties by order', () => {
    expect(parseAcceptLanguage('ru;q=0.4, en;q=0.9')).toBe('en');
    expect(parseAcceptLanguage('ru, en')).toBe('ru');
    expect(parseAcceptLanguage('en-GB;q=0.8, ru;q=0.8')).toBe('en');
  });

  it('discards unusable quality values and unsupported locales', () => {
    expect(parseAcceptLanguage('ru;q=0, en;q=0.5')).toBe('en');
    expect(parseAcceptLanguage('ru;q=bogus, en;q=0.5')).toBe('en');
    expect(parseAcceptLanguage('ru;q=2, en;q=0.5')).toBe('en');
    expect(parseAcceptLanguage('fr, *;q=0.9')).toBeUndefined();
  });
});

describe('resolveLocale', () => {
  it('takes the first resolvable value and otherwise the default', () => {
    expect(resolveLocale(null, 'ru-RU')).toBe('ru');
    expect(resolveLocale('fr', 'ru;q=0.7')).toBe('ru');
    expect(resolveLocale('fr', undefined)).toBe('en');
    expect(resolveLanguage('ru')).toBe('ru');
  });
});

describe('resolveLocaleFromHeaders', () => {
  it('reads a plain header record, including repeated values', () => {
    expect(resolveLocaleFromHeaders({ 'X-Locale': 'ru' })).toBe('ru');
    expect(resolveLocaleFromHeaders({ 'accept-language': ['fr', 'ru'] })).toBe('ru');
    expect(resolveLocaleFromHeaders({ 'x-locale': undefined, 'x-language': 'ru' })).toBe('ru');
  });

  it('reads a Headers-like getter and defaults when nothing is present', () => {
    const headers = new Map([['x-locale', 'ru']]);
    expect(resolveLocaleFromHeaders({ get: (name) => headers.get(name) ?? null })).toBe('ru');
    expect(resolveLanguageFromHeaders(undefined)).toBe('en');
    expect(resolveLocaleFromHeaders({})).toBe('en');
  });
});

describe('resolveLocaleFromRequest', () => {
  it('prefers explicit query values over every other source', () => {
    expect(resolveLocaleFromRequest({ query: { lang: ['ru', 'en'] }, language: 'en' })).toBe('ru');
    expect(resolveLocaleFromRequest({ query: { lang: [['ru']] } })).toBe('ru');
    expect(resolveLocaleFromRequest({ query: { lang: 7, locale: 'ru' } })).toBe('ru');
  });

  it('falls back through the URL, cookies, and explicit fields', () => {
    expect(resolveLocaleFromRequest({ url: '/api?lang=ru' })).toBe('ru');
    expect(resolveLocaleFromRequest({ originalUrl: '/api?locale=ru' })).toBe('ru');
    expect(resolveLocaleFromRequest({ url: '/api' })).toBe('en');
    expect(resolveLocaleFromRequest({ url: 'https://[' })).toBe('en');
    expect(resolveLocaleFromRequest({ cookies: { locale: 'ru' } })).toBe('ru');
    expect(resolveLocaleFromRequest({ cookies: { locale: 7, lang: 'ru' } })).toBe('ru');
    expect(resolveLocaleFromRequest({ locale: 'ru' })).toBe('ru');
    expect(resolveLanguageFromRequest({ language: 'ru' })).toBe('ru');
    expect(resolveLocaleFromRequest({})).toBe('en');
  });
});

describe('translation helpers', () => {
  it('detects keys present in the default catalog', () => {
    expect(hasTranslationKeyIn(catalog, 'greeting')).toBe(true);
    expect(hasTranslationKeyIn(catalog, 'missing')).toBe(false);
    expect(hasTranslationKeyIn({} as unknown as typeof catalog, 'greeting')).toBe(false);
  });

  it('interpolates named parameters and leaves unknown ones intact', () => {
    expect(interpolate('Hello {{ name }}', { name: 'Ada' })).toBe('Hello Ada');
    expect(interpolate('Hello {{ name }}')).toBe('Hello {{ name }}');
    expect(interpolate('Hello {{ name }}', { name: null })).toBe('Hello {{ name }}');
    expect(interpolate('Count {{ n }}', { n: 3 })).toBe('Count 3');
  });

  it('selects a plural category with the rules of the formatting locale', () => {
    const message = '{count, plural, =0 {no files} one {# file} few {# files} other {# files}}';
    expect(interpolate(message, { count: 0 }, 'en')).toBe('no files');
    expect(interpolate(message, { count: 1 }, 'en')).toBe('1 file');
    expect(interpolate(message, { count: 5 }, 'en')).toBe('5 files');
    // Russian sends 2 to `few` where English sends it to `other`; the runtime must ask Intl.
    expect(interpolate('{count, plural, one {файл} few {файла} other {файлов}}', { count: 2 }, 'ru')).toBe('файла');
  });

  it('orders with the ordinal rules when asked', () => {
    const message = '{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}';
    expect(interpolate(message, { place: 2 }, 'en')).toBe('2nd');
    expect(interpolate(message, { place: 11 }, 'en')).toBe('11th');
  });

  it('falls back to other when the plural argument is absent or not a number', () => {
    expect(interpolate('{count, plural, one {one} other {many}}', {})).toBe('many');
    expect(interpolate('{count, plural, one {one} other {many}}', { count: 'lots' })).toBe('many');
  });

  // A catalog authored against English rules declares `one` and `other` and nothing else, but
  // Russian sends 2 to `few`. The category lookup misses, and the message still has to render.
  it('falls back to other when the locale needs a category the message never declared', () => {
    expect(interpolate('{count, plural, one {файл} other {файлов}}', { count: 2 }, 'ru')).toBe('файлов');
  });

  it('falls back to other when the runtime cannot supply plural rules for the locale', () => {
    expect(interpolate('{count, plural, one {one} other {many}}', { count: 1 }, '!')).toBe('many');
  });

  it('selects a named branch and falls back to other', () => {
    const message = '{gender, select, female {She replied} male {He replied} other {They replied}}';
    expect(interpolate(message, { gender: 'female' })).toBe('She replied');
    expect(interpolate(message, { gender: 'nonbinary' })).toBe('They replied');
    expect(interpolate(message, {})).toBe('They replied');
  });

  it('interpolates placeholders inside a selected branch', () => {
    expect(
      interpolate('{count, plural, one {{{name}} has # invite} other {{{name}} has # invites}}', {
        count: 3,
        name: 'Ada',
      }),
    ).toBe('Ada has 3 invites');
  });

  it('leaves a block it cannot parse untouched', () => {
    expect(interpolate('a {not-a-block} b', {})).toBe('a {not-a-block} b');
    expect(interpolate('{count, plural}', {})).toBe('{count, plural}');
    expect(interpolate('{count, number, integer}', { count: 2 })).toBe('{count, number, integer}');
    expect(interpolate('{a b, plural, other {x}}', {})).toBe('{a b, plural, other {x}}');
    expect(interpolate('{count, plural, one {x}}', { count: 7 })).toBe('{count, plural, one {x}}');
    expect(interpolate('{count, plural, other {x} junk}', { count: 7 })).toBe('{count, plural, other {x} junk}');
    expect(interpolate('{count, plural, other {x}', { count: 7 })).toBe('{count, plural, other {x}');
  });

  it('tolerates cosmetic whitespace between branches', () => {
    expect(interpolate('{count, plural, other {x} }', { count: 7 })).toBe('x');
  });

  it('translates from the requested catalog and falls back to the default and the key', () => {
    expect(translateFromCatalog(catalog, 'greeting', { locale: 'ru', params: { name: 'Ада' } })).toBe('Привет Ада');
    expect(translateFromCatalog(catalog, 'only', { locale: 'ru' })).toBe('English only');
    expect(translateFromCatalog(catalog, 'greeting')).toBe('Hello {{ name }}');
    expect(translateFromCatalog(catalog, 'only', { locale: 'fr' })).toBe('English only');
    expect(translateFromCatalog(catalog, 'missing' as CatalogKey)).toBe('missing');
  });

  it('returns the key when the configured fallback locale has no catalog', () => {
    expect(translateFromCatalog(catalog, 'greeting', { fallbackLocale: 'de', locale: 'fr' })).toBe('greeting');
    expect(translateFromCatalog(catalog, 'greeting', { fallbackLocale: null, locale: 'fr' })).toBe('greeting');
  });
});
