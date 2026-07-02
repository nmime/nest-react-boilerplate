import enCommonCatalog from "../../../../../../i18n/en/common/shared.json";
import enErrorsCatalog from "../../../../../../i18n/en/common/errors.json";
import enLandingCatalog from "../../../../../../i18n/en/landing/app.json";
import ruCommonCatalog from "../../../../../../i18n/ru/common/shared.json";
import ruErrorsCatalog from "../../../../../../i18n/ru/common/errors.json";
import ruLandingCatalog from "../../../../../../i18n/ru/landing/app.json";
import { mergeLocaleCatalogFiles } from "../runtime";
import type {
  FrontendLocaleCatalogFileEntry,
  FrontendTranslations,
} from "./shared";

export const landingFrontendCatalogFileNames = [
  "common/shared.json",
  "common/errors.json",
  "landing/app.json",
] as const;

const enFiles = [
  ["common/shared.json", enCommonCatalog],
  ["common/errors.json", enErrorsCatalog],
  ["landing/app.json", enLandingCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

const ruFiles = [
  ["common/shared.json", ruCommonCatalog],
  ["common/errors.json", ruErrorsCatalog],
  ["landing/app.json", ruLandingCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

export const landingFrontendTranslations = {
  en: mergeLocaleCatalogFiles("en", enFiles),
  ru: mergeLocaleCatalogFiles("ru", ruFiles),
} as const satisfies FrontendTranslations;
