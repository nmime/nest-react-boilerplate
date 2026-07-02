import enBotCatalog from "../../../../../i18n/en/bots/telegram.json";
import enCommonCatalog from "../../../../../i18n/en/common/shared.json";
import enDiscordCatalog from "../../../../../i18n/en/bots/discord.json";
import enErrorsCatalog from "../../../../../i18n/en/common/errors.json";
import ruBotCatalog from "../../../../../i18n/ru/bots/telegram.json";
import ruCommonCatalog from "../../../../../i18n/ru/common/shared.json";
import ruDiscordCatalog from "../../../../../i18n/ru/bots/discord.json";
import ruErrorsCatalog from "../../../../../i18n/ru/common/errors.json";
import {
  mergeLocaleCatalogFiles,
  type Locale,
  type RuntimeLocaleCatalog,
} from "@app/common/i18n-runtime";

export const localeCatalogFileNames = [
  "common/shared.json",
  "common/errors.json",
  "bots/telegram.json",
  "bots/discord.json",
] as const;

type LocaleCatalogFileName = (typeof localeCatalogFileNames)[number];
type LocaleCatalogFileEntry = readonly [
  LocaleCatalogFileName,
  RuntimeLocaleCatalog,
];

export type { TranslationKey } from "@app/common/i18n-keys";

export type LocaleCatalog = RuntimeLocaleCatalog;

const enFiles = [
  ["common/shared.json", enCommonCatalog],
  ["common/errors.json", enErrorsCatalog],
  ["bots/telegram.json", enBotCatalog],
  ["bots/discord.json", enDiscordCatalog],
] as const satisfies readonly LocaleCatalogFileEntry[];
const ruFiles = [
  ["common/shared.json", ruCommonCatalog],
  ["common/errors.json", ruErrorsCatalog],
  ["bots/telegram.json", ruBotCatalog],
  ["bots/discord.json", ruDiscordCatalog],
] as const satisfies readonly LocaleCatalogFileEntry[];

export const en = mergeLocaleCatalogFiles("en", enFiles);
export const ru = mergeLocaleCatalogFiles("ru", ruFiles);

export const translations = {
  en,
  ru,
} as const satisfies Record<Locale, LocaleCatalog>;
