import enCommonCatalog from "../../../../../../i18n/en/common/shared.json";
import enErrorsCatalog from "../../../../../../i18n/en/common/errors.json";
import enAuthCatalog from "../../../../../../i18n/en/user/auth.json";
import enSocialAuthCatalog from "../../../../../../i18n/en/user/social-auth.json";
import enUserCatalog from "../../../../../../i18n/en/user/shell.json";
import enTmaCatalog from "../../../../../../i18n/en/user/tma.json";
import ruCommonCatalog from "../../../../../../i18n/ru/common/shared.json";
import ruErrorsCatalog from "../../../../../../i18n/ru/common/errors.json";
import ruAuthCatalog from "../../../../../../i18n/ru/user/auth.json";
import ruSocialAuthCatalog from "../../../../../../i18n/ru/user/social-auth.json";
import ruUserCatalog from "../../../../../../i18n/ru/user/shell.json";
import ruTmaCatalog from "../../../../../../i18n/ru/user/tma.json";
import { mergeLocaleCatalogFiles } from "../runtime";
import type {
  FrontendLocaleCatalogFileEntry,
  FrontendTranslations,
} from "./shared";

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
