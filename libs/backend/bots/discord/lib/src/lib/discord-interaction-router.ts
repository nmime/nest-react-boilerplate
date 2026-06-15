import { Injectable } from "@nestjs/common";
import {
  ButtonStyle,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  type APIApplicationCommandInteraction,
  type APIChatInputApplicationCommandInteractionData,
  type APIInteraction,
  type APIInteractionResponse,
  type APIMessageComponentInteraction,
  type APIModalSubmitInteraction,
} from "discord-api-types/v10";
import { DiscordAccountService } from "./discord-account.service";
import { resolveDiscordTenantId } from "./discord-config";
import {
  DiscordCustomIdCodec,
  type DiscordCustomIdAction,
} from "./discord-custom-id.codec";
import { resolveInteractionLocale, t } from "./discord-i18n";
import { DiscordNavigationStateService } from "./discord-navigation-state.service";
import {
  DiscordAccountCommandName,
  DiscordHelpCommandName,
  createButtonRow,
  customButton,
  linkButton,
} from "./discord-ui";

export interface DiscordInteractionContext {
  customIdSecret: string;
  webAppBaseUrl?: string;
  tenantId?: string | null;
}

type ChatInputInteraction = APIApplicationCommandInteraction & {
  data: APIChatInputApplicationCommandInteractionData;
};
type RoutedContext = Required<
  Pick<DiscordInteractionContext, "customIdSecret">
> & {
  webAppBaseUrl?: string;
  tenantId: string;
  locale: string;
};

@Injectable()
export class DiscordInteractionRouter {
  constructor(
    private readonly accounts: DiscordAccountService,
    private readonly customIds: DiscordCustomIdCodec,
    private readonly navigation: DiscordNavigationStateService,
  ) {}

  async route(
    interaction: APIInteraction,
    context: DiscordInteractionContext,
  ): Promise<APIInteractionResponse> {
    if (interaction.type === InteractionType.Ping) {
      return { type: InteractionResponseType.Pong };
    }
    const tenantId = resolveDiscordTenantId(context.tenantId);
    const locale = await resolveInteractionLocale(
      interaction,
      undefined,
      tenantId,
    );
    const routedContext = { ...context, tenantId, locale };
    if (interaction.type === InteractionType.ApplicationCommand) {
      return this.routeCommand(
        interaction as ChatInputInteraction,
        routedContext,
      );
    }
    if (interaction.type === InteractionType.MessageComponent) {
      return this.routeComponent(interaction, routedContext);
    }
    if (interaction.type === InteractionType.ModalSubmit) {
      return this.routeModal(interaction, routedContext);
    }
    return ephemeral(t("bot.error.unknown", locale));
  }

  private async routeCommand(
    interaction: ChatInputInteraction,
    context: RoutedContext,
  ): Promise<APIInteractionResponse> {
    if (interaction.data.name === DiscordHelpCommandName) {
      return this.help(interaction, context);
    }
    if (interaction.data.name !== DiscordAccountCommandName) {
      return ephemeral(t("bot.error.unknown", context.locale));
    }
    const subcommand = interaction.data.options?.[0]?.name;
    if (subcommand === "link") {
      return this.link(interaction, context);
    }
    if (subcommand === "status") {
      return this.status(interaction, context);
    }
    return ephemeral(t("bot.error.unknown", context.locale));
  }

  private async routeComponent(
    interaction: APIMessageComponentInteraction,
    context: RoutedContext,
  ): Promise<APIInteractionResponse> {
    const customId =
      "custom_id" in interaction.data ? interaction.data.custom_id : "";
    try {
      const decoded = this.customIds.decode(customId, {
        secret: context.customIdSecret,
      });
      const owner = interactionUser(interaction);
      this.customIds.assertOwner(decoded, {
        userId: owner.id,
        guildId: interaction.guild_id,
        tenantId: context.tenantId,
      });
      const state = this.navigation.get(decoded.nonce, {
        userId: owner.id,
        guildId: interaction.guild_id,
        tenantId: context.tenantId,
      });
      if (!state) {
        return ephemeral(t("bot.error.expired", context.locale));
      }
      switch (decoded.action) {
        case "home":
        case "back":
        case "open_app":
          return this.help(interaction, context);
        case "cancel":
          this.navigation.delete(decoded.nonce);
          return update(t("bot.error.unknown", context.locale), []);
        case "link":
          return this.link(interaction, context);
        case "unlink":
          return ephemeral(t("bot.error.unlinkFailed", context.locale));
        case "confirm":
          return ephemeral(t("discord.messages.authRequired", context.locale));
      }
    } catch {
      return ephemeral(t("bot.error.expired", context.locale));
    }
  }

  private routeModal(
    _interaction: APIModalSubmitInteraction,
    context: { locale: string },
  ): APIInteractionResponse {
    return ephemeral(t("bot.error.unknown", context.locale));
  }

  private async link(
    interaction: APIInteraction,
    context: RoutedContext,
  ): Promise<APIInteractionResponse> {
    const user = interactionUser(interaction);
    try {
      const result = await this.accounts.createLink({
        userId: user.id,
        guildId: interaction.guild_id,
        tenantId: context.tenantId,
        locale: context.locale as never,
        returnUrl: context.webAppBaseUrl,
      });
      return ephemeral(t("discord.commands.link.message", context.locale), [
        createButtonRow([
          linkButton(
            t("discord.components.linkButton", context.locale),
            result.authorizationUrl,
          ),
          this.stateButton(
            "cancel",
            t("discord.components.cancelButton", context.locale),
            interaction,
            context,
          ),
        ]),
      ]);
    } catch {
      return ephemeral(t("discord.commands.link.error", context.locale));
    }
  }

  private async status(
    interaction: APIInteraction,
    context: RoutedContext,
  ): Promise<APIInteractionResponse> {
    const user = interactionUser(interaction);
    const status = await this.accounts.status({
      userId: user.id,
      tenantId: context.tenantId,
    });
    const message = status.linked
      ? t("discord.commands.status.linked", context.locale)
      : t("discord.commands.status.notLinked", context.locale);
    return ephemeral(message, [
      createButtonRow([
        this.stateButton(
          status.linked ? "unlink" : "link",
          t(
            status.linked
              ? "discord.components.unlinkButton"
              : "discord.components.linkButton",
            context.locale,
          ),
          interaction,
          context,
          status.linked ? ButtonStyle.Danger : ButtonStyle.Primary,
        ),
        this.stateButton(
          "home",
          t("discord.components.helpButton", context.locale),
          interaction,
          context,
        ),
      ]),
    ]);
  }

  private help(
    interaction: APIInteraction,
    context: RoutedContext,
  ): APIInteractionResponse {
    const buttons: ReturnType<typeof linkButton | typeof customButton>[] = [
      this.stateButton(
        "link",
        t("discord.components.linkButton", context.locale),
        interaction,
        context,
        ButtonStyle.Primary,
      ),
      this.stateButton("home", "Home", interaction, context),
    ];
    if (context.webAppBaseUrl) {
      buttons.push(linkButton("Open App", context.webAppBaseUrl));
    }
    return ephemeral(t("discord.commands.help.message", context.locale), [
      createButtonRow(buttons),
    ]);
  }

  private stateButton(
    action: DiscordCustomIdAction,
    label: string,
    interaction: APIInteraction,
    context: RoutedContext,
    style:
      | ButtonStyle.Primary
      | ButtonStyle.Secondary
      | ButtonStyle.Success
      | ButtonStyle.Danger = ButtonStyle.Secondary,
  ) {
    const user = interactionUser(interaction);
    const customId = this.customIds.encode(
      {
        action,
        userId: user.id,
        guildId: interaction.guild_id,
        tenantId: context.tenantId,
      },
      { secret: context.customIdSecret },
    );
    const nonce = customId.split(":")[3] ?? customId;
    this.navigation.put({
      nonce,
      action,
      userId: user.id,
      guildId: interaction.guild_id,
      tenantId: context.tenantId,
      locale: context.locale,
      path: [action],
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    return customButton(customId, label, style);
  }
}

function ephemeral(
  content: string,
  components: Array<ReturnType<typeof createButtonRow>> = [],
): APIInteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content, flags: MessageFlags.Ephemeral, components },
  };
}

function update(
  content: string,
  components: Array<ReturnType<typeof createButtonRow>> = [],
): APIInteractionResponse {
  return {
    type: InteractionResponseType.UpdateMessage,
    data: { content, components },
  };
}

function interactionUser(interaction: APIInteraction): { id: string } {
  const maybeInteraction = interaction as {
    user?: { id: string };
    member?: { user?: { id: string } };
  };
  const user = maybeInteraction.user ?? maybeInteraction.member?.user;
  if (!user) {
    throw new Error("Discord interaction user missing.");
  }
  return user;
}
