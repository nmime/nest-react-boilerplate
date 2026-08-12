import {
  buildLocaleTranslations,
  defaultLocale,
  normalizeLocale,
  supportedLocales,
  toBcp47,
  translateFromCatalog,
  type Locale,
  type RuntimeLocaleCatalog,
} from '@app/common-i18n-runtime';
import type { TranslationKey } from '@app/common-i18n-keys';
import { Locale as DiscordApiLocale, type APIInteraction } from 'discord-api-types/v10';
import { catalogFileNames, localeCatalogFiles } from './catalogs.generated';

// Both axes come from `catalogs.generated.ts`, which `pnpm nrb i18n catalogs` rebuilds from the
// `i18n/` tree: a namespace or a locale is added by dropping files in, never by editing this module.
export const discordCatalogFileNames = catalogFileNames;

export const discordTranslations = buildLocaleTranslations(localeCatalogFiles);

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
  return defaultLocale;
}

export function resolveInteractionLocale(interaction: APIInteraction): Locale {
  const maybeInteraction = interaction as {
    locale?: string;
    guild_locale?: string;
  };
  return resolveDiscordLocale(maybeInteraction.locale, maybeInteraction.guild_locale);
}

/**
 * Discord's localization keys are a closed vocabulary and it rejects the whole bulk command payload
 * when one key is outside it, so the workspace axis cannot be published verbatim: a language Discord
 * does not carry, or a regional tag it spells `pt-BR` while the workspace stores `pt-br`, would cost
 * every command rather than the one locale.
 */
const discordLocaleVocabulary = new Set<string>(Object.values(DiscordApiLocale));

/** Workspace locale id -> the Discord tag it should publish under, for ids Discord does not carry. */
export type DiscordLocaleOverrides = Readonly<Record<string, string>>;

export interface DiscordLocalizationOptions {
  /** Defaults to the workspace axis; injectable so the vocabulary rules are testable on their own. */
  locales?: readonly string[];
  overrides?: DiscordLocaleOverrides;
  translations?: Readonly<Record<string, RuntimeLocaleCatalog | undefined>>;
}

/** Discord's spelling of a workspace locale, or undefined when Discord publishes no such locale. */
export function discordLocaleTag(locale: string, overrides: DiscordLocaleOverrides = {}): string | undefined {
  const tag = toBcp47(overrides[locale] ?? locale);
  return discordLocaleVocabulary.has(tag) ? tag : undefined;
}

/**
 * The locales left out of every command payload. Surfaced by the registration dry run so a product
 * sees which of its locales Discord will not carry instead of silently shipping fewer translations.
 */
export function unpublishableDiscordLocales(
  locales: readonly string[] = supportedLocales,
  overrides: DiscordLocaleOverrides = {},
): string[] {
  return locales.filter((locale) => locale !== defaultLocale && !discordLocaleTag(locale, overrides));
}

export function localizationsFor(
  key: TranslationKey,
  { locales = supportedLocales, overrides, translations = discordTranslations }: DiscordLocalizationOptions = {},
): Record<string, string> {
  const entries = locales
    .filter((locale) => locale !== defaultLocale)
    .flatMap((locale) => {
      const tag = discordLocaleTag(locale, overrides);
      const value = translations[locale]?.[key];
      return tag && value ? [[tag, value] as const] : [];
    });
  return Object.fromEntries(entries);
}
