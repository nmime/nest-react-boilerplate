import {
  buildLocaleTranslations,
  defaultLocale,
  resolveLocale,
  supportedLocales,
  translateFromCatalog,
  type Locale,
  type TranslateOptions,
} from '@app/common-i18n-runtime';
import type { TranslationKey } from '@app/common-i18n-keys';
import { catalogFileNames, localeCatalogFiles } from './catalogs.generated';
import type { TelegramBotContext, TelegramLinkedUserProfile } from './type';

export type { Locale, TranslationKey };
export { defaultLocale, supportedLocales };

// Both axes come from `catalogs.generated.ts`, which `pnpm nrb i18n catalogs` rebuilds from the
// `i18n/` tree: a namespace or a locale is added by dropping files in, never by editing this module.
export const telegramCatalogFileNames = catalogFileNames;

export const telegramTranslations = buildLocaleTranslations(localeCatalogFiles);

export function translate(key: TranslationKey, options: TranslateOptions = {}): string {
  return translateFromCatalog(telegramTranslations, key, options);
}

export function resolveTelegramLocale(input: {
  linkedUser?: Pick<TelegramLinkedUserProfile, 'locale'> | null;
  sessionLocale?: string | null;
  identityLocale?: string | null;
  telegramLanguageCode?: string | null;
}): Locale {
  return resolveLocale(
    input.linkedUser?.locale,
    input.sessionLocale,
    input.identityLocale,
    input.telegramLanguageCode,
    defaultLocale,
  );
}

export function createI18nMiddleware() {
  return async (ctx: TelegramBotContext, next: () => Promise<void>) => {
    ctx.t = (key: TranslationKey) => translate(key, { locale: ctx.session.locale ?? defaultLocale });
    await next();
  };
}
