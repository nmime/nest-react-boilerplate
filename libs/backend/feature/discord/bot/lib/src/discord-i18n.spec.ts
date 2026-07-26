// @requirements REQ-SOCIAL-COMMANDS-003
import { InteractionType } from 'discord-api-types/v10';
import { describe, expect, it } from 'vitest';
import {
  discordTranslations,
  localizationsFor,
  resolveDiscordLocale,
  resolveInteractionLocale,
  t,
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
