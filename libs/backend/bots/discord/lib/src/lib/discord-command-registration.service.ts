import { Injectable } from "@nestjs/common";
import { REST } from "@discordjs/rest";
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
    const rest = new REST({ version: "10" }).setToken(snapshot.botToken);
    const route =
      body.scope === "guild" && body.guildId
        ? Routes.applicationGuildCommands(body.applicationId, body.guildId)
        : Routes.applicationCommands(body.applicationId);
    await rest.put(route, { body: body.commands });
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
