export * from './shared';
export {
  defaultLocale,
  getLocalization,
  interpolate,
  isLanguage,
  Language,
  localeDisplayName,
  localeFallbackChain,
  localeLabel,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  resolveLocaleFromHeaders,
  resolveLocaleFromRequest,
  resolveLanguage,
  resolveLanguageFromHeaders,
  resolveLanguageFromRequest,
  supportedLocales,
  toBcp47,
} from '@app/common-i18n-runtime';
export type {
  Locale,
  LocaleFallbackOptions,
  LocaleHeaders,
  LocaleLabelOptions,
  Localizations,
  LocaleRequestSource,
  TranslateOptions,
  TranslationParams,
} from '@app/common-i18n-runtime';
export type { TranslationKey } from '@app/common-i18n-keys';
