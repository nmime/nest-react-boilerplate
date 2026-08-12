// @requirements REQ-SOCIAL-COMMANDS-003
import { InteractionType, Locale as DiscordApiLocale } from 'discord-api-types/v10';
import { supportedLocales } from '@app/common-i18n-runtime';
import { describe, expect, it } from 'vitest';
import {
  discordLocaleTag,
  discordTranslations,
  localizationsFor,
  resolveDiscordLocale,
  resolveInteractionLocale,
  t,
  unpublishableDiscordLocales,
} from './discord-i18n';

const testValue = <T>(value: unknown): T => value as T;

describe('Discord i18n helpers', () => {
  it('resolves locale order and fallback', () => {
    expect(resolveDiscordLocale('fr', 'ru')).toBe('ru');
    expect(resolveDiscordLocale('en-US', 'ru')).toBe('en');
    expect(resolveDiscordLocale(undefined, null, 'unsupported')).toBe('en');
  });

  it('resolves the interaction locale, then guild locale, then default', () => {
    expect(resolveInteractionLocale(interaction({ locale: 'ru', guild_locale: 'en-US' }))).toBe('ru');
    expect(resolveInteractionLocale(interaction({ locale: 'fr', guild_locale: 'ru' }))).toBe('ru');
    expect(resolveInteractionLocale(interaction({ locale: 'fr', guild_locale: 'unsupported' }))).toBe('en');
  });

  it('returns localized errors and command localization maps', () => {
    expect(t('bot.error.expired', 'ru')).toBe('Действие бота истекло. Начните заново.');
    expect(localizationsFor('discord.commands.help.label')).toEqual({
      ru: 'помощь',
    });
  });

  it('binds a catalog for every workspace locale', () => {
    expect(Object.keys(discordTranslations)).toEqual([...supportedLocales]);
    expect(discordTranslations.ru['errors.unauthorized.title']).toBeTruthy();
    expect(discordTranslations.ru['bot.error.expired']).toBeTruthy();
  });

  it('publishes workspace locales under the tags Discord actually accepts', () => {
    const workspaceCatalog = { 'discord.commands.help.label': 'помощь' };
    const localizations = localizationsFor('discord.commands.help.label', {
      locales: ['ru', 'pt-br', 'uz-cyrl'],
      translations: {
        'pt-br': { 'discord.commands.help.label': 'ajuda' },
        ru: workspaceCatalog,
        'uz-cyrl': { 'discord.commands.help.label': 'ёрдам' },
      },
    });

    expect(Object.keys(localizations)).toEqual(['ru', 'pt-BR']);
    for (const tag of Object.keys(localizations)) {
      expect(new Set<string>(Object.values(DiscordApiLocale)).has(tag)).toBe(true);
    }
    expect(unpublishableDiscordLocales(['ru', 'pt-br', 'uz-cyrl'])).toEqual(['uz-cyrl']);
    expect(unpublishableDiscordLocales()).toEqual([]);
  });

  it('republishes a locale Discord does not carry under a declared override', () => {
    const overrides = { 'uz-cyrl': 'ru' };

    expect(discordLocaleTag('uz-cyrl', overrides)).toBe('ru');
    expect(discordLocaleTag('uz-cyrl')).toBeUndefined();
    expect(discordLocaleTag('kk', { kk: 'not-a-discord-tag' })).toBeUndefined();
    expect(unpublishableDiscordLocales(['uz-cyrl'], overrides)).toEqual([]);
  });

  it('omits supported locales that have no value for the key', () => {
    const key = 'discord.commands.help.label';
    const ruCatalog = discordTranslations.ru;
    const original = ruCatalog[key];
    delete ruCatalog[key];
    try {
      expect(localizationsFor(key)).toEqual({});
    } finally {
      if (original !== undefined) {
        ruCatalog[key] = original;
      }
    }
  });
});

function interaction(overrides: { locale?: string; guild_locale?: string }) {
  return testValue<Parameters<typeof resolveInteractionLocale>[0]>({
    type: InteractionType.ApplicationCommand,
    id: '1',
    application_id: '2',
    version: 1,
    user: { id: '123456789012345678' },
    data: { id: '3', name: 'help', type: 1 },
    ...overrides,
  });
}
