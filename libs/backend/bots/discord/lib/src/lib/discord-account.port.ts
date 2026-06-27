import type { Locale } from "@app/common/i18n";

export interface DiscordAccountLinkResult {
  authorizationUrl: string;
  expiresAt?: string;
}

export interface DiscordAccountStatusResult {
  linked: boolean;
  displayName?: string | null;
}

export interface DiscordCreateAccountLinkInput {
  userId: string;
  guildId?: string | null;
  tenantId?: string | null;
  locale: Locale;
  returnUrl?: string | null;
}

export interface DiscordAccountStatusInput {
  userId: string;
  tenantId?: string | null;
}

export abstract class DiscordAccountApplicationPort {
  abstract createLink(
    input: DiscordCreateAccountLinkInput,
  ): Promise<DiscordAccountLinkResult>;

  abstract status(
    input: DiscordAccountStatusInput,
  ): Promise<DiscordAccountStatusResult>;
}
