import enErrorsCatalog from "@app/i18n/en/common/errors.json";
import enCommonCatalog from "@app/i18n/en/common/shared.json";
import ruErrorsCatalog from "@app/i18n/ru/common/errors.json";
import ruCommonCatalog from "@app/i18n/ru/common/shared.json";
import type { TranslationKey } from "@app/common/i18n-keys";
import {
  fallbackLocale,
  hasTranslationKeyIn,
  interpolate,
  mergeLocaleCatalogFiles,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  supportedLocales,
  translateFromCatalog,
  type Locale,
  type RuntimeLocaleCatalog,
  type TranslateOptions,
  type TranslationParams,
} from "@app/common/i18n-runtime";

export type FrontendLocaleCatalog = Partial<Record<TranslationKey, string>>;
export type FrontendTranslations = Record<Locale, FrontendLocaleCatalog>;
export type FrontendLocaleCatalogFileEntry<FileName extends string = string> =
  readonly [FileName, RuntimeLocaleCatalog];

export interface FrontendTranslateOptions extends TranslateOptions {
  translations?: FrontendTranslations;
}

export const sharedFrontendCatalogFileNames = [
  "common/shared.json",
  "common/errors.json",
] as const;

const enFiles = [
  ["common/shared.json", enCommonCatalog],
  ["common/errors.json", enErrorsCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

const ruFiles = [
  ["common/shared.json", ruCommonCatalog],
  ["common/errors.json", ruErrorsCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

export const sharedFrontendTranslations = {
  en: mergeLocaleCatalogFiles("en", enFiles),
  ru: mergeLocaleCatalogFiles("ru", ruFiles),
} as const satisfies FrontendTranslations;

export function hasFrontendTranslationKey(
  key: string,
  translations: FrontendTranslations = sharedFrontendTranslations,
): key is TranslationKey {
  return hasTranslationKeyIn(translations, key);
}

export function translate(
  key: TranslationKey,
  {
    translations = sharedFrontendTranslations,
    ...options
  }: FrontendTranslateOptions = {},
): string {
  return translateFromCatalog(translations, key, options);
}

export {
  fallbackLocale,
  interpolate,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  supportedLocales,
};

export type { Locale, TranslateOptions, TranslationKey, TranslationParams };
