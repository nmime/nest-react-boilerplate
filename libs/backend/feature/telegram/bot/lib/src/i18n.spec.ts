// @requirements REQ-SOCIAL-COMMANDS-003
import { describe, expect, it } from 'vitest';
import {
  createI18nMiddleware,
  resolveTelegramLocale,
  supportedLocales,
  telegramCatalogFileNames,
  telegramTranslations,
} from './i18n';
import type { TelegramBotContext } from './type';

const testValue = <T>(value: unknown): T => value as T;

describe('Telegram bot i18n', () => {
  it('binds a catalog for every workspace locale without naming a locale', () => {
    expect(Object.keys(telegramTranslations)).toEqual([...supportedLocales]);
    expect([...telegramCatalogFileNames]).toEqual([
      'bots/shared.json',
      'bots/telegram.json',
      'common/errors.json',
      'common/shared.json',
    ]);
    expect(telegramTranslations.ru['errors.unauthorized.title']).toBeTruthy();
    expect(telegramTranslations.ru['bot.error.expired']).toBeTruthy();
  });

  it('resolves locale by linked user, session, identity, Telegram language, then fallback', () => {
    expect(
      resolveTelegramLocale({
        linkedUser: { locale: 'ru' },
        sessionLocale: 'en',
        identityLocale: 'en',
        telegramLanguageCode: 'en-US',
      }),
    ).toBe('ru');
    expect(
      resolveTelegramLocale({
        sessionLocale: 'ru',
        identityLocale: 'en',
        telegramLanguageCode: 'en-US',
      }),
    ).toBe('ru');
    expect(
      resolveTelegramLocale({
        identityLocale: 'ru',
        telegramLanguageCode: 'en-US',
      }),
    ).toBe('ru');
    expect(resolveTelegramLocale({ telegramLanguageCode: 'ru-RU' })).toBe('ru');
    expect(resolveTelegramLocale({ telegramLanguageCode: 'unsupported' })).toBe('en');
  });

  it('exposes ctx.t using the current session locale for public replies', async () => {
    const middleware = createI18nMiddleware();
    const ctx = testValue<TelegramBotContext>({
      session: { locale: 'ru' },
    });
    let translated = '';

    await middleware(ctx, () => {
      translated = ctx.t('bot.message.welcome');
      ctx.session.locale = 'en';
      translated += `|${ctx.t('bot.message.welcome')}`;
      return Promise.resolve();
    });

    expect(translated).toBe(
      '👋 Добро пожаловать!\n\nВсё необходимое — в одном касании.|👋 Welcome!\n\nEverything you need is one tap away.',
    );
  });

  it('falls back to the default locale when session locale is missing', async () => {
    const middleware = createI18nMiddleware();
    const ctx = testValue<TelegramBotContext>({ session: {} });
    let translated = '';

    await middleware(ctx, () => {
      translated = ctx.t('bot.message.welcome');
      return Promise.resolve();
    });

    expect(translated).toBe('👋 Welcome!\n\nEverything you need is one tap away.');
  });
});
