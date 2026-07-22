import enAdminAuditCatalog from '@app/i18n-en-admin/audit.json';
import enAdminDashboardCatalog from '@app/i18n-en-admin/dashboard.json';
import enAdminFeatureFlagsCatalog from '@app/i18n-en-admin/feature-flags.json';
import enAdminNavigationCatalog from '@app/i18n-en-admin/navigation.json';
import enAdminNotificationOptionsCatalog from '@app/i18n-en-admin/notification-options.json';
import enAdminRolesCatalog from '@app/i18n-en-admin/roles.json';
import enAdminProblemPresentationsCatalog from '@app/i18n-en-admin/problem-presentations.json';
import enAdminNotificationsCatalog from '@app/i18n-en-admin/notifications.json';
import enAdminNotificationNavigationCatalog from '@app/i18n-en-admin/notification-navigation.json';
import enAdminLoginAnalyticsCatalog from '@app/i18n-en-admin/login-analytics.json';
import enAdminCatalog from '@app/i18n-en-admin/shell.json';
import enAdminUsersCatalog from '@app/i18n-en-admin/users.json';
import enErrorsCatalog from '@app/i18n-en-common/errors.json';
import enCommonCatalog from '@app/i18n-en-common/shared.json';
import ruAdminAuditCatalog from '@app/i18n-ru-admin/audit.json';
import ruAdminDashboardCatalog from '@app/i18n-ru-admin/dashboard.json';
import ruAdminFeatureFlagsCatalog from '@app/i18n-ru-admin/feature-flags.json';
import ruAdminNavigationCatalog from '@app/i18n-ru-admin/navigation.json';
import ruAdminNotificationOptionsCatalog from '@app/i18n-ru-admin/notification-options.json';
import ruAdminRolesCatalog from '@app/i18n-ru-admin/roles.json';
import ruAdminProblemPresentationsCatalog from '@app/i18n-ru-admin/problem-presentations.json';
import ruAdminNotificationsCatalog from '@app/i18n-ru-admin/notifications.json';
import ruAdminNotificationNavigationCatalog from '@app/i18n-ru-admin/notification-navigation.json';
import ruAdminLoginAnalyticsCatalog from '@app/i18n-ru-admin/login-analytics.json';
import ruAdminCatalog from '@app/i18n-ru-admin/shell.json';
import ruAdminUsersCatalog from '@app/i18n-ru-admin/users.json';
import ruErrorsCatalog from '@app/i18n-ru-common/errors.json';
import ruCommonCatalog from '@app/i18n-ru-common/shared.json';
import { mergeLocaleCatalogFiles } from '@app/common-i18n-runtime';
import type { FrontendLocaleCatalogFileEntry, FrontendTranslations } from '@app/frontend-i18n-shared';

export const adminFrontendCatalogFileNames = [
  'common/shared.json',
  'common/errors.json',
  'admin/shell.json',
  'admin/navigation.json',
  'admin/dashboard.json',
  'admin/feature-flags.json',
  'admin/users.json',
  'admin/audit.json',
  'admin/roles.json',
  'admin/problem-presentations.json',
  'admin/notifications.json',
  'admin/notification-options.json',
  'admin/notification-navigation.json',
  'admin/login-analytics.json',
] as const;

const enFiles = [
  ['common/shared.json', enCommonCatalog],
  ['common/errors.json', enErrorsCatalog],
  ['admin/shell.json', enAdminCatalog],
  ['admin/navigation.json', enAdminNavigationCatalog],
  ['admin/dashboard.json', enAdminDashboardCatalog],
  ['admin/feature-flags.json', enAdminFeatureFlagsCatalog],
  ['admin/users.json', enAdminUsersCatalog],
  ['admin/audit.json', enAdminAuditCatalog],
  ['admin/roles.json', enAdminRolesCatalog],
  ['admin/problem-presentations.json', enAdminProblemPresentationsCatalog],
  ['admin/notifications.json', enAdminNotificationsCatalog],
  ['admin/notification-options.json', enAdminNotificationOptionsCatalog],
  ['admin/notification-navigation.json', enAdminNotificationNavigationCatalog],
  ['admin/login-analytics.json', enAdminLoginAnalyticsCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

const ruFiles = [
  ['common/shared.json', ruCommonCatalog],
  ['common/errors.json', ruErrorsCatalog],
  ['admin/shell.json', ruAdminCatalog],
  ['admin/navigation.json', ruAdminNavigationCatalog],
  ['admin/dashboard.json', ruAdminDashboardCatalog],
  ['admin/feature-flags.json', ruAdminFeatureFlagsCatalog],
  ['admin/users.json', ruAdminUsersCatalog],
  ['admin/audit.json', ruAdminAuditCatalog],
  ['admin/roles.json', ruAdminRolesCatalog],
  ['admin/problem-presentations.json', ruAdminProblemPresentationsCatalog],
  ['admin/notifications.json', ruAdminNotificationsCatalog],
  ['admin/notification-options.json', ruAdminNotificationOptionsCatalog],
  ['admin/notification-navigation.json', ruAdminNotificationNavigationCatalog],
  ['admin/login-analytics.json', ruAdminLoginAnalyticsCatalog],
] as const satisfies readonly FrontendLocaleCatalogFileEntry[];

export const adminFrontendTranslations = {
  en: mergeLocaleCatalogFiles('en', enFiles),
  ru: mergeLocaleCatalogFiles('ru', ruFiles),
} as const satisfies FrontendTranslations;
