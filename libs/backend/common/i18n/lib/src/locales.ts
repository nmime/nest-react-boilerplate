import { buildLocaleTranslations, type RuntimeLocaleCatalog } from '@app/common-i18n-runtime';
import { catalogFileNames, localeCatalogFiles } from './catalogs.generated';

export const backendCatalogFileNames = catalogFileNames;
export type { TranslationKey } from '@app/common-i18n-keys';
export type LocaleCatalog = RuntimeLocaleCatalog;

// Both the file list and the per-locale imports come from `catalogs.generated.ts`, which
// `pnpm nrb i18n catalogs` rebuilds from the `i18n/` tree. A new namespace or locale is a file
// drop plus a regeneration, never an edit here.
export const translations = buildLocaleTranslations(localeCatalogFiles);
