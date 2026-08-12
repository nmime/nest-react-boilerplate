import { buildLocaleTranslations } from '@app/common-i18n-runtime';
import type { FrontendTranslations } from '@app/frontend-i18n-shared';
import { catalogFileNames, localeCatalogFiles } from './catalogs.generated';

// Both axes come from `catalogs.generated.ts`, which `pnpm nrb i18n catalogs` rebuilds from the
// `i18n/` tree: a namespace or a locale is added by dropping files in, never by editing this list.
export const userFrontendCatalogFileNames = catalogFileNames;

export const userFrontendTranslations: FrontendTranslations = buildLocaleTranslations(localeCatalogFiles);
