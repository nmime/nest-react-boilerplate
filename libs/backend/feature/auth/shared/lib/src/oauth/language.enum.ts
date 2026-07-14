import { createIsEnum } from '../util';

export enum Language {
  En = 'en',
  Ru = 'ru',
  Zh = 'zh',
}

export const defaultLanguage = Language.En;

export const isLanguage = createIsEnum(Language);
