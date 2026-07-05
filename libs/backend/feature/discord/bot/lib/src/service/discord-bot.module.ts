import {
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type Provider,
} from "@nestjs/common";
import { DiscordAccountApplicationPort } from "../type/discord-account.port";
import { DiscordAccountService } from "./discord-account.service";
import { DiscordCommandRegistrationService } from "./discord-command-registration.service";
import { DiscordBotConfig } from "./discord-config";
import { DiscordCustomIdCodec } from "./discord-custom-id.codec";
import { DiscordInteractionRouter } from "../handler/discord-interaction-router";
import { DiscordInteractionSecurity } from "../discord-interaction-security";
import { DiscordNavigationStateService } from "./discord-navigation-state.service";

@Module({
  providers: [
    DiscordAccountService,
    {
      provide: DiscordAccountApplicationPort,
      useExisting: DiscordAccountService,
    },
    DiscordBotConfig,
    DiscordCommandRegistrationService,
    DiscordCustomIdCodec,
    DiscordInteractionRouter,
    DiscordInteractionSecurity,
    DiscordNavigationStateService,
  ],
  exports: [
    DiscordAccountService,
    DiscordAccountApplicationPort,
    DiscordBotConfig,
    DiscordCommandRegistrationService,
    DiscordCustomIdCodec,
    DiscordInteractionRouter,
    DiscordInteractionSecurity,
    DiscordNavigationStateService,
  ],
})
export class DiscordBotModule {
  /**
   * Compose the bot with a concrete external-auth provider bound into the
   * module's own injection scope. `DiscordAccountService` lives in this module,
   * so its `DiscordAccountExternalAuthInjectToken` dependency must be resolvable
   * here — providers declared only in the host app module are not visible
   * across the module boundary. The host passes the module(s) that export the
   * provider's own dependencies (e.g. the auth feature's `ExternalAuthService`)
   * via `imports`, keeping the composition/layering decision in the app.
   *
   * The base providers/exports from the `@Module` decorator are merged with the
   * returned metadata, so a plain `DiscordBotModule` import still works when no
   * external-auth provider is needed.
   */
  static forRoot(
    options: {
      imports?: NonNullable<ModuleMetadata["imports"]>;
      externalAuthProvider?: Provider;
    } = {},
  ): DynamicModule {
    return {
      module: DiscordBotModule,
      imports: options.imports ?? [],
      providers: options.externalAuthProvider
        ? [options.externalAuthProvider]
        : [],
    };
  }
}
