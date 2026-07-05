import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponent,
  type APIButtonComponentWithCustomId,
  type APIButtonComponentWithURL,
  type APIComponentInMessageActionRow,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { localizationsFor, t } from "./discord-i18n";

export const DiscordAccountCommandName = "account";
export const DiscordHelpCommandName = "help";

export interface DiscordCommandDefinition {
  name: string;
  description: string;
  json: RESTPostAPIChatInputApplicationCommandsJSONBody;
}

export function buildDiscordCommands(): DiscordCommandDefinition[] {
  const commands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
    {
      name: DiscordAccountCommandName,
      description: "Manage account linking.",
      name_localizations: {},
      description_localizations: {
        ru: "Управление привязкой аккаунта.",
      },
      options: [
        {
          type: 1,
          name: "link",
          description: t("discord.commands.link.description", "en"),
          name_localizations: localizationsFor("discord.commands.link.label"),
          description_localizations: localizationsFor(
            "discord.commands.link.description",
          ),
        },
        {
          type: 1,
          name: "status",
          description: t("discord.commands.status.description", "en"),
          name_localizations: localizationsFor("discord.commands.status.label"),
          description_localizations: localizationsFor(
            "discord.commands.status.description",
          ),
        },
      ],
    },
    {
      name: DiscordHelpCommandName,
      description: t("discord.commands.help.description", "en"),
      name_localizations: localizationsFor("discord.commands.help.label"),
      description_localizations: localizationsFor(
        "discord.commands.help.description",
      ),
    },
  ];

  return commands.map((json) => {
    validateCommandLocalization(json);
    return { name: json.name, description: json.description, json };
  });
}

export function createButtonRow(
  buttons: APIButtonComponent[],
): APIActionRowComponent<APIComponentInMessageActionRow> {
  return { type: ComponentType.ActionRow, components: buttons };
}

export function customButton(
  customId: string,
  label: string,
  style:
    | ButtonStyle.Primary
    | ButtonStyle.Secondary
    | ButtonStyle.Success
    | ButtonStyle.Danger = ButtonStyle.Secondary,
): APIButtonComponentWithCustomId {
  return {
    type: ComponentType.Button,
    custom_id: customId,
    label: clamp(label, 80),
    style,
  };
}

export function linkButton(
  label: string,
  url: string,
): APIButtonComponentWithURL {
  return {
    type: ComponentType.Button,
    label: clamp(label, 80),
    style: ButtonStyle.Link,
    url,
  };
}

export function validateCommandLocalization(
  command: RESTPostAPIChatInputApplicationCommandsJSONBody,
): void {
  assertLocalizedNameAndDescription(command);
  for (const option of command.options ?? []) {
    assertLocalizedNameAndDescription(option);
  }
}

function assertLocalizedNameAndDescription(input: {
  name: string;
  description: string;
  name_localizations?: Record<string, string | null> | null;
  description_localizations?: Record<string, string | null> | null;
}): void {
  assertCommandName(input.name);
  assertDescription(input.description);
  assertLocalizationMap(input.name_localizations, assertCommandName);
  assertLocalizationMap(input.description_localizations, assertDescription);
}

function assertLocalizationMap(
  map: Record<string, string | null> | null | undefined,
  assertValue: (value: string, locale?: string) => void,
): void {
  for (const [locale, value] of Object.entries(map ?? {})) {
    if (value !== null) {
      assertValue(value, locale);
    }
  }
}
function assertCommandName(name: string, locale = "default"): void {
  if (name.length < 1 || name.length > 32 || name !== name.toLowerCase()) {
    throw new Error(`Invalid Discord command name localization for ${locale}.`);
  }
}

function assertDescription(description: string, locale = "default"): void {
  if (description.length < 1 || description.length > 100) {
    throw new Error(
      `Invalid Discord command description localization for ${locale}.`,
    );
  }
}

function clamp(value: string, length: number): string {
  return value.length > length
    ? `${value.slice(0, length - 1).trimEnd()}…`
    : value;
}
