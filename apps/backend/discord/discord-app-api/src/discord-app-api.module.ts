import { Module } from "@nestjs/common";
import {
  DiscordAccountExternalAuthInjectToken,
  DiscordBotModule,
} from "@app/backend-feature-discord-bot";
import { AuthMainModule } from "@app/backend-feature-auth-main";
import { DiscordExternalAuthAdapter } from "./discord-external-auth.adapter";
import { DiscordInteractionsController } from "./discord-interactions.controller";

// Shared reference so the auth feature (its `ExternalAuthService` and its
// in-memory OAuth-state map) is a single instance across both the app and the
// DiscordBotModule scope, keeping the authorization-request/callback flow
// consistent.
const authMainModule = AuthMainModule.forRoot();

@Module({
  imports: [
    authMainModule,
    // Bind the account service's external-auth port inside the bot module's
    // scope, delegating to the auth feature's ExternalAuthService via an
    // in-process adapter (DI, not HTTP).
    DiscordBotModule.forRoot({
      imports: [authMainModule],
      externalAuthProvider: {
        provide: DiscordAccountExternalAuthInjectToken,
        useClass: DiscordExternalAuthAdapter,
      },
    }),
  ],
  controllers: [DiscordInteractionsController],
})
export class DiscordAppApiModule {}
