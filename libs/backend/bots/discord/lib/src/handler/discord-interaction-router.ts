import { Injectable } from "@nestjs/common";
import {
  ButtonStyle,
  InteractionResponseType,
  InteractionType,
  type APIApplicationCommandInteraction,
  type APIChatInputApplicationCommandInteractionData,
  type APIInteraction,
  type APIInteractionResponse,
  type APIMessageComponentInteraction,
  type APIModalSubmitInteraction,
} from "discord-api-types/v10";
import { DiscordAccountLinkNotConfiguredError } from "../service/discord-account.service";
import { DiscordAccountApplicationPort } from "../type/discord-account.port";
import { resolveDiscordTenantId } from "../service/discord-config";
import {
  DiscordCustomIdCodec,
  type DiscordCustomIdAction,
} from "../service/discord-custom-id.codec";
import { resolveInteractionLocale, t } from "../discord-i18n";
import { DiscordNavigationStateService } from "../service/discord-navigation-state.service";
import {
  DiscordAccountCommandName,
  DiscordHelpCommandName,
  createButtonRow,
  customButton,
  linkButton,
} from "../discord-ui";
import type { DiscordInteractionContext } from "../type/discord-interaction-router.type";
import {
  componentValidationMessage,
  ephemeral,
  interactionUser,
  respond,
  update,
  type ComponentRenderMode,
} from "../util";

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

/* v8 ignore start -- Nest @Injectable() emits a decorator-helper branch that is unreachable for a class-only decorator. */
@Injectable()
/* v8 ignore stop */
export class DiscordInteractionRouter {
  constructor(
    private readonly accounts: DiscordAccountApplicationPort,
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
    const locale = resolveInteractionLocale(interaction);
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
      const state = this.navigation.get(decoded.nonce);
      if (!state) {
        return ephemeral(t("bot.error.expired", context.locale));
      }
      const stateLocale = state.locale || context.locale;
      const stateContext = { ...context, locale: stateLocale };
      switch (decoded.action) {
        case "home":
          return this.help(interaction, stateContext, "update");
        case "back":
          return this.status(interaction, stateContext, "update");
        case "open_app":
          return this.openApp(stateContext);
        case "cancel":
          this.navigation.delete(decoded.nonce);
          return update(t("discord.messages.cancelled", stateLocale), []);
        case "link":
          return this.link(interaction, stateContext, "update");
        case "unlink":
          return this.unlink(interaction, stateContext, "update");
        case "confirm":
          return this.confirmUnlink(interaction, stateContext);
      }
    } catch (error) {
      return ephemeral(componentValidationMessage(error, context.locale));
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
    mode: ComponentRenderMode = "ephemeral",
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
      return respond(mode, t("discord.commands.link.message", context.locale), [
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
    } catch (error) {
      const message =
        error instanceof DiscordAccountLinkNotConfiguredError
          ? t("discord.commands.link.missingConfig", context.locale)
          : t("discord.commands.link.error", context.locale);
      return respond(mode, message, [
        createButtonRow([
          this.stateButton(
            "back",
            t("discord.components.backButton", context.locale),
            interaction,
            context,
          ),
          this.stateButton(
            "home",
            t("discord.components.homeButton", context.locale),
            interaction,
            context,
          ),
        ]),
      ]);
    }
  }

  private async confirmUnlink(
    interaction: APIMessageComponentInteraction,
    context: RoutedContext,
  ): Promise<APIInteractionResponse> {
    const user = interactionUser(interaction);
    try {
      const result = await this.accounts.unlink({
        userId: user.id,
        guildId: interaction.guild_id,
        tenantId: context.tenantId,
      });
      if (result.unlinked) {
        return update(t("discord.messages.unlinkSuccess", context.locale), []);
      }
    } catch {
      // Fall through to the actionable failure response below.
    }
    return update(t("bot.error.unlinkFailed", context.locale), [
      createButtonRow([
        this.stateButton(
          "back",
          t("discord.components.backButton", context.locale),
          interaction,
          context,
        ),
        this.stateButton(
          "home",
          t("discord.components.homeButton", context.locale),
          interaction,
          context,
        ),
      ]),
    ]);
  }

  private async status(
    interaction: APIInteraction,
    context: RoutedContext,
    mode: ComponentRenderMode = "ephemeral",
  ): Promise<APIInteractionResponse> {
    const user = interactionUser(interaction);
    let status: Awaited<ReturnType<DiscordAccountApplicationPort["status"]>>;
    try {
      status = await this.accounts.status({
        userId: user.id,
        tenantId: context.tenantId,
      });
    } catch {
      return respond(mode, t("bot.error.unavailable", context.locale));
    }
    const message = status.linked
      ? t("discord.commands.status.linked", context.locale)
      : t("discord.commands.status.notLinked", context.locale);
    return respond(mode, message, [
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
          t("discord.components.homeButton", context.locale),
          interaction,
          context,
        ),
      ]),
    ]);
  }

  private unlink(
    interaction: APIInteraction,
    context: RoutedContext,
    mode: ComponentRenderMode = "ephemeral",
  ): APIInteractionResponse {
    return respond(mode, t("discord.messages.unlinkConfirm", context.locale), [
      createButtonRow([
        this.stateButton(
          "confirm",
          t("discord.components.confirmButton", context.locale),
          interaction,
          context,
          ButtonStyle.Danger,
        ),
        this.stateButton(
          "back",
          t("discord.components.backButton", context.locale),
          interaction,
          context,
        ),
        this.stateButton(
          "cancel",
          t("discord.components.cancelButton", context.locale),
          interaction,
          context,
        ),
      ]),
    ]);
  }

  private openApp(context: RoutedContext): APIInteractionResponse {
    if (!context.webAppBaseUrl) {
      return ephemeral(
        t("discord.messages.openAppUnavailable", context.locale),
      );
    }
    return ephemeral(context.webAppBaseUrl);
  }

  private help(
    interaction: APIInteraction,
    context: RoutedContext,
    mode: ComponentRenderMode = "ephemeral",
  ): APIInteractionResponse {
    const buttons: ReturnType<typeof linkButton | typeof customButton>[] = [
      this.stateButton(
        "link",
        t("discord.components.linkButton", context.locale),
        interaction,
        context,
        ButtonStyle.Primary,
      ),
      this.stateButton(
        "back",
        t("discord.components.statusButton", context.locale),
        interaction,
        context,
      ),
      this.stateButton(
        "home",
        t("discord.components.homeButton", context.locale),
        interaction,
        context,
      ),
    ];
    if (context.webAppBaseUrl) {
      buttons.push(
        linkButton(
          t("discord.components.openAppButton", context.locale),
          context.webAppBaseUrl,
        ),
      );
    } else {
      buttons.push(
        this.stateButton(
          "open_app",
          t("discord.components.openAppButton", context.locale),
          interaction,
          context,
        ),
      );
    }
    return respond(mode, t("discord.commands.help.message", context.locale), [
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
    const nonce = customId.split(":")[3] as string;
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
