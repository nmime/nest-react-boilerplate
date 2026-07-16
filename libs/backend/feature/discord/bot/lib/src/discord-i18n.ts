import enDiscordCatalog from '@app/i18n-en-bots/discord.json';
import enBotSharedCatalog from '@app/i18n-en-bots/shared.json';
import ruDiscordCatalog from '@app/i18n-ru-bots/discord.json';
import ruBotSharedCatalog from '@app/i18n-ru-bots/shared.json';
import { translations as backendTranslations } from '@app/backend-common-i18n';
import {
  fallbackLocale,
  mergeLocaleCatalogFiles,
  normalizeLocale,
  supportedLocales,
  translateFromCatalog,
  type Locale,
  type RuntimeLocaleCatalog,
} from '@app/common-i18n-runtime';
import type { TranslationKey } from '@app/common-i18n-keys';
import type { APIInteraction } from 'discord-api-types/v10';

export const discordCatalogFileNames = [
  'common/shared.json',
  'common/errors.json',
  'bots/shared.json',
  'bots/discord.json',
] as const;

export const discordTranslations = {
  en: mergeLocaleCatalogFiles('en', [
    ['backend-common', backendTranslations.en],
    ['bots/shared.json', enBotSharedCatalog],
    ['bots/discord.json', enDiscordCatalog],
  ]),
  ru: mergeLocaleCatalogFiles('ru', [
    ['backend-common', backendTranslations.ru],
    ['bots/shared.json', ruBotSharedCatalog],
    ['bots/discord.json', ruDiscordCatalog],
  ]),
} as const satisfies Record<Locale, RuntimeLocaleCatalog>;

export function t(
  key: TranslationKey,
  locale: string | null | undefined,
  params?: Record<string, string | number | boolean | null | undefined>,
): string {
  return translateFromCatalog(discordTranslations, key, { locale: resolveDiscordLocale(locale), params });
}

export function resolveDiscordLocale(...values: Array<string | null | undefined>): Locale {
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
  return resolveDiscordLocale(maybeInteraction.locale, maybeInteraction.guild_locale);
}

export function localizationsFor(key: TranslationKey): Record<string, string> {
  const entries = supportedLocales
    .filter((locale) => locale !== fallbackLocale)
    .flatMap((locale) => {
      const value = discordTranslations[locale][key];
      return value ? [[locale, value] as const] : [];
    });
  return Object.fromEntries(entries);
}
