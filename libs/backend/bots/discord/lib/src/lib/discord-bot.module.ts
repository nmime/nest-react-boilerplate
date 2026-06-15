import { Module } from "@nestjs/common";
import { DiscordAccountService } from "./discord-account.service";
import { DiscordCommandRegistrationService } from "./discord-command-registration.service";
import { DiscordBotConfig } from "./discord-config";
import { DiscordCustomIdCodec } from "./discord-custom-id.codec";
import { DiscordInteractionRouter } from "./discord-interaction-router";
import { DiscordInteractionSecurity } from "./discord-interaction-security";
import { DiscordNavigationStateService } from "./discord-navigation-state.service";

@Module({
  providers: [
    DiscordAccountService,
    DiscordBotConfig,
    DiscordCommandRegistrationService,
    DiscordCustomIdCodec,
    DiscordInteractionRouter,
    DiscordInteractionSecurity,
    DiscordNavigationStateService,
  ],
  exports: [
    DiscordAccountService,
    DiscordBotConfig,
    DiscordCommandRegistrationService,
    DiscordCustomIdCodec,
    DiscordInteractionRouter,
    DiscordInteractionSecurity,
    DiscordNavigationStateService,
  ],
})
export class DiscordBotModule {}
