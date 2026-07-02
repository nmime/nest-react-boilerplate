import { translations, type TranslationKey } from "./locales";
import {
  fallbackLocale,
  hasTranslationKeyIn,
  interpolate,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  resolveLocaleFromRequest,
  supportedLocales,
  translateFromCatalog,
  type Locale,
  type LocaleRequestSource,
  type TranslateOptions,
  type TranslationParams,
} from "./runtime";

export { localeCatalogFileNames, translations } from "./locales";
export type { LocaleCatalog, TranslationKey } from "./locales";
export {
  fallbackLocale,
  interpolate,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  resolveLocaleFromRequest,
  supportedLocales,
};
export type {
  Locale,
  LocaleRequestSource,
  TranslateOptions,
  TranslationParams,
};

export function hasTranslationKey(key: string): key is TranslationKey {
  return hasTranslationKeyIn(translations, key);
}

export function translate(
  key: TranslationKey,
  options: TranslateOptions = {},
): string {
  return translateFromCatalog(translations, key, options);
}

export class I18nService {
  readonly fallbackLocale = fallbackLocale;
  readonly supportedLocales = supportedLocales;

  translate(key: TranslationKey, options: TranslateOptions = {}): string {
    return translate(key, options);
  }

  resolveLocale(...values: Array<string | null | undefined>): Locale {
    return resolveLocale(...values);
  }

  resolveLocaleFromRequest(source: LocaleRequestSource): Locale {
    return resolveLocaleFromRequest(source);
  }
}

export function createRequestLocaleMiddleware(i18n = new I18nService()) {
  return (
    request: LocaleRequestSource,
    _response: unknown,
    next: () => void,
  ): void => {
    const locale = i18n.resolveLocaleFromRequest(request);
    request.locale = locale;
    request.language = locale;
    next();
  };
}
