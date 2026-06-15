import {
  fallbackLocale,
  resolveLocale,
  translate,
  type Locale,
  type TranslationKey,
} from "@app/common/i18n";
import type { TelegramBotContext, TelegramLinkedUserProfile } from "./types";

export function resolveTelegramLocale(input: {
  linkedUser?: Pick<TelegramLinkedUserProfile, "locale"> | null;
  sessionLocale?: string | null;
  identityLocale?: string | null;
  telegramLanguageCode?: string | null;
}): Locale {
  return resolveLocale(
    input.linkedUser?.locale,
    input.sessionLocale,
    input.identityLocale,
    input.telegramLanguageCode,
    fallbackLocale,
  );
}

export function createI18nMiddleware() {
  return async (ctx: TelegramBotContext, next: () => Promise<void>) => {
    ctx.t = (key: TranslationKey) =>
      translate(key, { locale: ctx.session?.locale ?? fallbackLocale });
    await next();
  };
}
