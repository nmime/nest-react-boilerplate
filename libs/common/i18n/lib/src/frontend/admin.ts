import enAdminAuditCatalog from "../../../../../../i18n/en/admin/audit.json";
import enAdminDashboardCatalog from "../../../../../../i18n/en/admin/dashboard.json";
import enAdminRolesCatalog from "../../../../../../i18n/en/admin/roles.json";
import enAdminCatalog from "../../../../../../i18n/en/admin/shell.json";
import enAdminUsersCatalog from "../../../../../../i18n/en/admin/users.json";
import enCommonCatalog from "../../../../../../i18n/en/common/shared.json";
import enErrorsCatalog from "../../../../../../i18n/en/common/errors.json";
import ruAdminAuditCatalog from "../../../../../../i18n/ru/admin/audit.json";
import ruAdminDashboardCatalog from "../../../../../../i18n/ru/admin/dashboard.json";
import ruAdminRolesCatalog from "../../../../../../i18n/ru/admin/roles.json";
import ruAdminCatalog from "../../../../../../i18n/ru/admin/shell.json";
import ruAdminUsersCatalog from "../../../../../../i18n/ru/admin/users.json";
import ruCommonCatalog from "../../../../../../i18n/ru/common/shared.json";
import ruErrorsCatalog from "../../../../../../i18n/ru/common/errors.json";
import { mergeLocaleCatalogFiles } from "../runtime";
import type {
  FrontendLocaleCatalogFileEntry,
  FrontendTranslations,
} from "./shared";

export const adminFrontendCatalogFileNames = [
  "common/shared.json",
  "common/errors.json",
  "admin/shell.json",
  "admin/dashboard.json",
  "admin/users.json",
  "admin/audit.json",
  "admin/roles.json",
] as const;

const enFiles = [
  ["common/shared.json", enCommonCatalog],
  ["common/errors.json", enErrorsCatalog],
  ["admin/shell.json", enAdminCatalog],
  ["admin/dashboard.json", enAdminDashboardCatalog],
  ["admin/users.json", enAdminUsersCatalog],
  ["admin/audit.json", enAdminAuditCatalog],
  ["admin/roles.json", enAdminRolesCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

const ruFiles = [
  ["common/shared.json", ruCommonCatalog],
  ["common/errors.json", ruErrorsCatalog],
  ["admin/shell.json", ruAdminCatalog],
  ["admin/dashboard.json", ruAdminDashboardCatalog],
  ["admin/users.json", ruAdminUsersCatalog],
  ["admin/audit.json", ruAdminAuditCatalog],
  ["admin/roles.json", ruAdminRolesCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

export const adminFrontendTranslations = {
  en: mergeLocaleCatalogFiles("en", enFiles),
  ru: mergeLocaleCatalogFiles("ru", ruFiles),
} as const satisfies FrontendTranslations;
