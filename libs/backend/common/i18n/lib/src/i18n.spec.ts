// @requirements REQ-RUNTIME-CONFIG-003
import { describe, expect, it, vi } from 'vitest';
import {
  I18nService,
  backendCatalogFileNames,
  createRequestLocaleMiddleware,
  getLocalization,
  hasTranslationKey,
  Language,
  parseAcceptLanguage,
  resolveLocale,
  resolveLanguageFromHeaders,
  resolveLanguageFromRequest,
  supportedLocales,
  translate,
  translations,
} from './index';
import { catalogFileNames, localeCatalogFiles } from './catalogs.generated';

describe('@app/backend-common-i18n', () => {
  it('owns only backend-common and error catalogs', () => {
    expect([...backendCatalogFileNames].sort()).toEqual(['common/errors.json', 'common/shared.json']);
    expect(translations.en['common.language']).toBe('Language');
    expect(translations.en['bot.menu.main']).toBeUndefined();
    expect(translations.en['discord.commands.link.label']).toBeUndefined();
  });

  it('takes its catalog list from the generated manifest rather than a hand-written import list', () => {
    // Adding a namespace or a locale means dropping files into `i18n/` and regenerating. If this
    // module kept its own list, the two would drift and the new file would simply never load.
    expect(backendCatalogFileNames).toBe(catalogFileNames);

    for (const locale of supportedLocales) {
      expect(localeCatalogFiles[locale].map(([fileName]) => fileName)).toEqual([...catalogFileNames]);
      expect(Object.keys(translations[locale]).length).toBeGreaterThan(0);
    }
  });

  it('provides common translation and request locale utilities', () => {
    expect(hasTranslationKey('errors.rate-limited.title')).toBe(true);
    expect(translate('common.language', { locale: 'ru' })).toBe('Язык');
    expect(resolveLocale('ru-RU')).toBe('ru');
    expect(Language.En).toBe('en');
    expect(Language.Ru).toBe('ru');
    expect(getLocalization({ en: 'Hello', ru: 'Привет' }, Language.Ru)).toBe('Привет');
    expect(getLocalization({ en: 'Hello' }, 'fr')).toBe('Hello');
    expect(getLocalization({ ru: 'Привет' }, Language.En)).toBe('Привет');
    const i18n = new I18nService();
    expect(i18n.translate('common.ready', { locale: 'en' })).toBe('Ready');
    expect(i18n.resolveLocale('ru-RU')).toBe('ru');
    const request = { headers: { 'accept-language': 'ru' } };
    const next = vi.fn();
    createRequestLocaleMiddleware()(request, {}, next);
    expect(request).toMatchObject({ locale: 'ru', language: 'ru' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('resolves API language from case-insensitive and Fetch-style headers', () => {
    expect(resolveLanguageFromHeaders({ 'Accept-Language': 'en;q=0.2, ru-RU;q=0.9' })).toBe(Language.Ru);
    expect(resolveLanguageFromHeaders({ 'X-Locale': 'ru', 'Accept-Language': 'en' })).toBe(Language.Ru);
    expect(resolveLanguageFromHeaders({ get: (name) => (name === 'accept-language' ? 'ru-RU' : null) })).toBe(
      Language.Ru,
    );
    expect(resolveLanguageFromHeaders({ 'Accept-Language': ['fr', 'ru;q=0.8'] })).toBe(Language.Ru);
  });

  it('parses Accept-Language quality and preserves request resolver precedence', () => {
    expect(parseAcceptLanguage('ru;q=0, en;q=0.5')).toBe(Language.En);
    expect(parseAcceptLanguage('ru;q=bogus, en;q=0.5')).toBe(Language.En);
    expect(parseAcceptLanguage('fr, *;q=0.9')).toBeUndefined();
    expect(resolveLanguageFromRequest({ query: { lang: 'en' }, headers: { 'Accept-Language': 'ru' } })).toBe(
      Language.En,
    );
  });
});
