import enCommonCatalog from '@app/i18n-en-common/shared.json';
import enErrorsCatalog from '@app/i18n-en-common/errors.json';
import ruCommonCatalog from '@app/i18n-ru-common/shared.json';
import ruErrorsCatalog from '@app/i18n-ru-common/errors.json';
import { mergeLocaleCatalogFiles, type Locale, type RuntimeLocaleCatalog } from '@app/common-i18n-runtime';

export const backendCatalogFileNames = ['common/shared.json', 'common/errors.json'] as const;
export type { TranslationKey } from '@app/common-i18n-keys';
export type LocaleCatalog = RuntimeLocaleCatalog;

export const translations = {
  en: mergeLocaleCatalogFiles('en', [
    ['common/shared.json', enCommonCatalog],
    ['common/errors.json', enErrorsCatalog],
  ]),
  ru: mergeLocaleCatalogFiles('ru', [
    ['common/shared.json', ruCommonCatalog],
    ['common/errors.json', ruErrorsCatalog],
  ]),
} as const satisfies Record<Locale, LocaleCatalog>;
