import type { Api } from 'grammy';

export const TelegramBotInstanceInjectToken = Symbol('TelegramBotInstanceInjectToken');

/** Minimal Telegram transport surface exposed to sibling backend features. */
export interface TelegramBotTransport {
  bot: {
    api: Pick<Api, 'sendMessage' | 'sendPhoto'>;
  };
}
