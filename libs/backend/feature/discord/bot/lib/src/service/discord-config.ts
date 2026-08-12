import { Injectable } from '@nestjs/common';
import type { DiscordLocaleOverrides } from '../discord-i18n';

export interface DiscordBotConfigSnapshot {
  applicationId: string;
  botToken?: string;
  publicKey: string;
  registrationGuildId?: string;
  registrationScope: 'global' | 'guild';
  webAppBaseUrl?: string;
  defaultTenantId?: string;
  customIdSecret: string;
  /** Which Discord locale each workspace locale Discord does not carry should be published under. */
  localeOverrides: DiscordLocaleOverrides;
}

export const DefaultDiscordCustomIdTtlSeconds = 15 * 60;
export const DefaultDiscordTenantId = '00000000-0000-0000-0000-000000000000';

@Injectable()
export class DiscordBotConfig {
  snapshot(env: NodeJS.ProcessEnv = process.env): DiscordBotConfigSnapshot {
    const registrationGuildId = clean(env.DISCORD_REGISTRATION_GUILD_ID);
    return {
      applicationId: requireConfig(env.DISCORD_APPLICATION_ID, 'DISCORD_APPLICATION_ID'),
      botToken: clean(env.DISCORD_BOT_TOKEN),
      publicKey: requireConfig(env.DISCORD_PUBLIC_KEY, 'DISCORD_PUBLIC_KEY'),
      registrationGuildId,
      registrationScope:
        clean(env.DISCORD_COMMAND_REGISTRATION_SCOPE) === 'guild' || registrationGuildId ? 'guild' : 'global',
      webAppBaseUrl: clean(env.DISCORD_WEB_APP_BASE_URL ?? env.AUTH_APP_BASE_URL),
      defaultTenantId: clean(env.DISCORD_DEFAULT_TENANT_ID),
      customIdSecret: requireConfig(env.DISCORD_CUSTOM_ID_SECRET, 'DISCORD_CUSTOM_ID_SECRET'),
      localeOverrides: parseLocaleOverrides(clean(env.DISCORD_LOCALE_OVERRIDES)),
    };
  }
}

/**
 * `DISCORD_LOCALE_OVERRIDES=uz-cyrl=ru,kk=ru` — comma-separated `<workspace locale>=<Discord locale>`
 * pairs, for locales Discord does not publish. Malformed pairs are dropped rather than fatal: an
 * override is a cosmetic improvement to the command payload, never a precondition for serving.
 */
function parseLocaleOverrides(value: string | undefined): DiscordLocaleOverrides {
  const entries = (value ?? '').split(',').flatMap((pair) => {
    const [locale, tag] = pair.split('=').map((part) => part.trim());
    return locale && tag ? [[locale.toLowerCase(), tag] as const] : [];
  });

  return Object.fromEntries(entries);
}

export function resolveDiscordTenantId(
  interactionTenantId?: string | null,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return clean(interactionTenantId) ?? clean(env.DISCORD_DEFAULT_TENANT_ID) ?? DefaultDiscordTenantId;
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
