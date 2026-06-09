import { createIsEnum } from "../util/enum.util";

export enum Language {
  En = "en",
  Ru = "ru",
  Zh = "zh",
}

export const defaultLanguage = Language.En;

export const isLanguage = createIsEnum(Language);
