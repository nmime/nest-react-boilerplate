// @requirements REQ-SOCIAL-COMMANDS-003
import { describe, expect, it } from 'vitest';
import { TelegramBotAuthInjectToken, TelegramBotInstanceInjectToken } from '../const';
import { telegramBotRoutes } from './telegram.type';

describe('Telegram bot public types', () => {
  it('keeps the public route registry and injection tokens stable', () => {
    expect(telegramBotRoutes).toEqual([
      'main',
      'profile',
      'settings',
      'settings.language',
      'settings.language.confirm',
      'support',
      'support.contact',
      'link',
      'link.instructions',
    ]);
    expect(TelegramBotAuthInjectToken.description).toBe('TelegramBotAuthInjectToken');
    expect(TelegramBotInstanceInjectToken.description).toBe('TelegramBotInstanceInjectToken');
  });
});
