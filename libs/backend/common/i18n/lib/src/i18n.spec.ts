import { describe, expect, it, vi } from 'vitest';
import {
  I18nService,
  backendCatalogFileNames,
  createRequestLocaleMiddleware,
  hasTranslationKey,
  resolveLocale,
  translate,
  translations,
} from './index';

describe('@app/backend-common-i18n', () => {
  it('owns only backend-common and error catalogs', () => {
    expect(backendCatalogFileNames).toEqual(['common/shared.json', 'common/errors.json']);
    expect(translations.en['common.language']).toBe('Language');
    expect(translations.en['bot.menu.main']).toBeUndefined();
    expect(translations.en['discord.commands.link.label']).toBeUndefined();
  });

  it('provides common translation and request locale utilities', () => {
    expect(hasTranslationKey('errors.rate-limited.title')).toBe(true);
    expect(translate('common.language', { locale: 'ru' })).toBe('Язык');
    expect(resolveLocale('ru-RU')).toBe('ru');
    const i18n = new I18nService();
    expect(i18n.translate('common.ready', { locale: 'en' })).toBe('Ready');
    expect(i18n.resolveLocale('ru-RU')).toBe('ru');
    const request = { headers: { 'accept-language': 'ru' } };
    const next = vi.fn();
    createRequestLocaleMiddleware()(request, {}, next);
    expect(request).toMatchObject({ locale: 'ru', language: 'ru' });
    expect(next).toHaveBeenCalledOnce();
  });
});
