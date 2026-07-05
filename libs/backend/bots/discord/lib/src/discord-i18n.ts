import {
  fallbackLocale,
  normalizeLocale,
  supportedLocales,
  translate,
  translations,
  type Locale,
  type TranslationKey,
} from "@app/common-i18n";
import type { APIInteraction } from "discord-api-types/v10";

export function t(
  key: TranslationKey,
  locale: string | null | undefined,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  return translate(key, { locale: resolveDiscordLocale(locale), params });
}

export function resolveDiscordLocale(
  ...values: Array<string | null | undefined>
): Locale {
  for (const value of values) {
    const locale = normalizeLocale(value);
    if (locale) {
      return locale;
    }
  }
  return fallbackLocale;
}

export function resolveInteractionLocale(interaction: APIInteraction): Locale {
  const maybeInteraction = interaction as {
    locale?: string;
    guild_locale?: string;
  };
  return resolveDiscordLocale(
    maybeInteraction.locale,
    maybeInteraction.guild_locale,
  );
}

export function localizationsFor(key: TranslationKey): Record<string, string> {
  const entries = supportedLocales
    .filter((locale) => locale !== fallbackLocale)
    .flatMap((locale) => {
      const value = translations[locale][key];
      return value ? [[locale, value] as const] : [];
    });
  return Object.fromEntries(entries);
}
