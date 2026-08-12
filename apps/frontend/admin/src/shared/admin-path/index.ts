import { translate, type TranslationKey, type TranslationParams } from '@app/frontend-runtime';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';

export type Translate = (key: TranslationKey, params?: TranslationParams) => string;

export const fallbackTranslate: Translate = (key, params) =>
  translate(key, { params, translations: adminFrontendTranslations });

export const normalizeAdminPath = (path: string): string => {
  const normalizedPath = path.split('?')[0]?.replace(/\/$/u, '') || '/';
  if (normalizedPath === '/admin') {
    return '/';
  }
  return normalizedPath.startsWith('/admin/') ? normalizedPath.slice('/admin'.length) : normalizedPath;
};
