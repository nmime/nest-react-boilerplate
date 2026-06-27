import { Injectable, Optional } from "@nestjs/common";
import type { Locale } from "@app/common/i18n";
import { DefaultDiscordTenantId } from "./discord-config";
import {
  DiscordAccountApplicationPort,
  type DiscordAccountLinkResult,
  type DiscordAccountStatusResult,
  type DiscordAccountStatusInput,
  type DiscordCreateAccountLinkInput,
} from "./discord-account.port";

export class DiscordAccountLinkNotConfiguredError extends Error {
  constructor() {
    super("Discord account link URL builder is not configured.");
  }
}

interface DiscordExternalAuthPort {
  createDiscordAuthorizationRequest(input: {
    tenantId: string;
    intent: "link";
    returnUrl?: string | null;
    principal: { subject: string; tenantId: string };
  }): { authorizationUrl: string; stateExpiresAt: string };
  listProviderIdentities(
    userId: string,
    tenantId: string,
  ): Promise<
    Array<{
      provider: string;
      providerSubject: string;
      displayName: string | null;
      username: string | null;
    }>
  >;
}

export interface DiscordAccountLinkUrlBuilder {
  build(input: {
    userId: string;
    guildId?: string | null;
    tenantId: string;
    locale: Locale;
    returnUrl?: string | null;
  }): Promise<DiscordAccountLinkResult> | DiscordAccountLinkResult;
}

@Injectable()
export class DiscordAccountService extends DiscordAccountApplicationPort {
  constructor(
    @Optional()
    private readonly externalAuth?: DiscordExternalAuthPort,
    @Optional()
    private readonly linkUrlBuilder?: DiscordAccountLinkUrlBuilder,
  ) {
    super();
  }

  async createLink(
    input: DiscordCreateAccountLinkInput,
  ): Promise<DiscordAccountLinkResult> {
    const tenantId = input.tenantId ?? DefaultDiscordTenantId;
    if (this.linkUrlBuilder) {
      return this.linkUrlBuilder.build({ ...input, tenantId });
    }
    if (this.externalAuth) {
      const result = this.externalAuth.createDiscordAuthorizationRequest({
        tenantId,
        intent: "link",
        returnUrl: input.returnUrl,
        principal: { subject: input.userId, tenantId },
      });
      return {
        authorizationUrl: result.authorizationUrl,
        expiresAt: result.stateExpiresAt,
      };
    }
    const configured = process.env.DISCORD_AUTH_LINK_URL_TEMPLATE;
    if (!configured) {
      throw new DiscordAccountLinkNotConfiguredError();
    }
    return {
      authorizationUrl: configured
        .replaceAll("{discordUserId}", encodeURIComponent(input.userId))
        .replaceAll("{guildId}", encodeURIComponent(input.guildId ?? ""))
        .replaceAll("{tenantId}", encodeURIComponent(tenantId))
        .replaceAll("{locale}", encodeURIComponent(input.locale)),
    };
  }

  async status(
    input: DiscordAccountStatusInput,
  ): Promise<DiscordAccountStatusResult> {
    if (!this.externalAuth) {
      return { linked: false };
    }
    const identities = await this.externalAuth.listProviderIdentities(
      input.userId,
      input.tenantId ?? DefaultDiscordTenantId,
    );
    const identity = identities.find(
      (item) =>
        item.provider === "discord" && item.providerSubject === input.userId,
    );
    return {
      linked: Boolean(identity),
      displayName: identity?.displayName ?? identity?.username ?? null,
    };
  }
}
