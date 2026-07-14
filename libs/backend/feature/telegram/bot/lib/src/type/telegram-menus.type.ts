import type { Menu } from '@grammyjs/menu';
import type { TelegramBotContext } from './telegram.type';

export interface TelegramBotMenus {
  main: Menu<TelegramBotContext>;
  profile: Menu<TelegramBotContext>;
  settings: Menu<TelegramBotContext>;
  language: Menu<TelegramBotContext>;
  support: Menu<TelegramBotContext>;
  link: Menu<TelegramBotContext>;
}
