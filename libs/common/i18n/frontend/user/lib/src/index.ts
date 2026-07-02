import enErrorsCatalog from "@app/i18n/en/common/errors.json";
import enCommonCatalog from "@app/i18n/en/common/shared.json";
import enAuthCatalog from "@app/i18n/en/user/auth.json";
import enSocialAuthCatalog from "@app/i18n/en/user/social-auth.json";
import enUserCatalog from "@app/i18n/en/user/shell.json";
import enTmaCatalog from "@app/i18n/en/user/tma.json";
import ruErrorsCatalog from "@app/i18n/ru/common/errors.json";
import ruCommonCatalog from "@app/i18n/ru/common/shared.json";
import ruAuthCatalog from "@app/i18n/ru/user/auth.json";
import ruSocialAuthCatalog from "@app/i18n/ru/user/social-auth.json";
import ruUserCatalog from "@app/i18n/ru/user/shell.json";
import ruTmaCatalog from "@app/i18n/ru/user/tma.json";
import { mergeLocaleCatalogFiles } from "@app/common/i18n-runtime";
import type {
  FrontendLocaleCatalogFileEntry,
  FrontendTranslations,
} from "@app/common/i18n/frontend-shared";

export const userFrontendCatalogFileNames = [
  "common/shared.json",
  "common/errors.json",
  "user/shell.json",
  "user/auth.json",
  "user/social-auth.json",
  "user/tma.json",
] as const;

const enFiles = [
  ["common/shared.json", enCommonCatalog],
  ["common/errors.json", enErrorsCatalog],
  ["user/shell.json", enUserCatalog],
  ["user/auth.json", enAuthCatalog],
  ["user/social-auth.json", enSocialAuthCatalog],
  ["user/tma.json", enTmaCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

const ruFiles = [
  ["common/shared.json", ruCommonCatalog],
  ["common/errors.json", ruErrorsCatalog],
  ["user/shell.json", ruUserCatalog],
  ["user/auth.json", ruAuthCatalog],
  ["user/social-auth.json", ruSocialAuthCatalog],
  ["user/tma.json", ruTmaCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

export const userFrontendTranslations = {
  en: mergeLocaleCatalogFiles("en", enFiles),
  ru: mergeLocaleCatalogFiles("ru", ruFiles),
} as const satisfies FrontendTranslations;
