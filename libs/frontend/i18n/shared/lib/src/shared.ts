import type { TranslationKey } from '@app/common-i18n-keys';
import {
  buildLocaleTranslations,
  hasTranslationKeyIn,
  translateFromCatalog,
  type Locale,
  type RuntimeLocaleCatalog,
  type TranslateOptions,
} from '@app/common-i18n-runtime';
import { catalogFileNames, localeCatalogFiles } from './catalogs.generated';

export type FrontendLocaleCatalog = Partial<Record<TranslationKey, string>>;
export type FrontendTranslations = Record<Locale, FrontendLocaleCatalog>;
export type FrontendLocaleCatalogFileEntry<FileName extends string = string> = readonly [
  FileName,
  RuntimeLocaleCatalog,
];

export interface FrontendTranslateOptions extends TranslateOptions {
  translations?: FrontendTranslations;
}

// Both axes come from `catalogs.generated.ts`, which `pnpm nrb i18n catalogs` rebuilds from the
// `i18n/` tree: a namespace or a locale is added by dropping files in, never by editing this list.
export const sharedFrontendCatalogFileNames = catalogFileNames;

export const sharedFrontendTranslations: FrontendTranslations = buildLocaleTranslations(localeCatalogFiles);

export function hasFrontendTranslationKey(
  key: string,
  translations: FrontendTranslations = sharedFrontendTranslations,
): key is TranslationKey {
  return hasTranslationKeyIn(translations, key);
}

export function translate(
  key: TranslationKey,
  { translations = sharedFrontendTranslations, ...options }: FrontendTranslateOptions = {},
): string {
  return translateFromCatalog(translations, key, options);
}
