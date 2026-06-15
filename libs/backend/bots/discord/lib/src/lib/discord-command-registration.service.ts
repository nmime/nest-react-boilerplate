import { Injectable } from "@nestjs/common";
import {
  Routes,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import {
  DiscordBotConfig,
  type DiscordBotConfigSnapshot,
} from "./discord-config";
import { buildDiscordCommands } from "./discord-ui";

export interface DiscordCommandRegistrationSnapshot {
  scope: "global" | "guild";
  applicationId: string;
  guildId?: string;
  commands: RESTPostAPIChatInputApplicationCommandsJSONBody[];
}

@Injectable()
export class DiscordCommandRegistrationService {
  constructor(private readonly config: DiscordBotConfig) {}

  dryRun(
    env: NodeJS.ProcessEnv = process.env,
  ): DiscordCommandRegistrationSnapshot {
    return this.createSnapshot(this.config.snapshot(env));
  }

  async register(
    env: NodeJS.ProcessEnv = process.env,
  ): Promise<DiscordCommandRegistrationSnapshot> {
    const snapshot = this.config.snapshot(env);
    if (!snapshot.botToken) {
      throw new Error(
        "DISCORD_BOT_TOKEN is required for Discord command registration.",
      );
    }
    const body = this.createSnapshot(snapshot);
    const route =
      body.scope === "guild" && body.guildId
        ? Routes.applicationGuildCommands(body.applicationId, body.guildId)
        : Routes.applicationCommands(body.applicationId);
    await putDiscordCommands(route, snapshot.botToken, body.commands);
    return body;
  }

  private createSnapshot(
    snapshot: DiscordBotConfigSnapshot,
  ): DiscordCommandRegistrationSnapshot {
    return {
      scope: snapshot.registrationScope,
      applicationId: snapshot.applicationId,
      guildId: snapshot.registrationGuildId,
      commands: buildDiscordCommands().map((command) => command.json),
    };
  }
}

async function putDiscordCommands(
  route: string,
  botToken: string,
  commands: RESTPostAPIChatInputApplicationCommandsJSONBody[],
): Promise<void> {
  const response = await fetch(`https://discord.com/api/v10${route}`, {
    method: "PUT",
    headers: {
      authorization: `Bot ${botToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!response.ok) {
    throw new Error(
      `Discord command registration failed with status ${response.status}.`,
    );
  }
}
