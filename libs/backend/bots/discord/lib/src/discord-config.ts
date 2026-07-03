import { Injectable } from "@nestjs/common";

export interface DiscordBotConfigSnapshot {
  applicationId: string;
  botToken?: string;
  publicKey: string;
  registrationGuildId?: string;
  registrationScope: "global" | "guild";
  webAppBaseUrl?: string;
  defaultTenantId?: string;
  customIdSecret: string;
}

export const DefaultDiscordCustomIdTtlSeconds = 15 * 60;
export const DefaultDiscordTenantId = "00000000-0000-0000-0000-000000000000";

@Injectable()
export class DiscordBotConfig {
  snapshot(env: NodeJS.ProcessEnv = process.env): DiscordBotConfigSnapshot {
    const registrationGuildId = clean(env.DISCORD_REGISTRATION_GUILD_ID);
    return {
      applicationId: requireConfig(
        env.DISCORD_APPLICATION_ID,
        "DISCORD_APPLICATION_ID",
      ),
      botToken: clean(env.DISCORD_BOT_TOKEN),
      publicKey: requireConfig(env.DISCORD_PUBLIC_KEY, "DISCORD_PUBLIC_KEY"),
      registrationGuildId,
      registrationScope:
        clean(env.DISCORD_COMMAND_REGISTRATION_SCOPE) === "guild" ||
        registrationGuildId
          ? "guild"
          : "global",
      webAppBaseUrl: clean(
        env.DISCORD_WEB_APP_BASE_URL ?? env.AUTH_APP_BASE_URL,
      ),
      defaultTenantId: clean(env.DISCORD_DEFAULT_TENANT_ID),
      customIdSecret: requireConfig(
        env.DISCORD_CUSTOM_ID_SECRET ?? env.AUTH_JWT_SECRET,
        "DISCORD_CUSTOM_ID_SECRET",
      ),
    };
  }
}

export function resolveDiscordTenantId(
  interactionTenantId?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    clean(interactionTenantId) ??
    clean(env.DISCORD_DEFAULT_TENANT_ID) ??
    DefaultDiscordTenantId
  );
}

function clean(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function requireConfig(value: string | null | undefined, name: string): string {
  const normalized = clean(value);
  if (!normalized) {
    throw new Error(`${name} is required for Discord bot runtime.`);
  }
  return normalized;
}
