import { Module } from '@nestjs/common';
import { DiscordAccountExternalAuthInjectToken, DiscordBotModule } from '@app/backend-feature-discord-bot';
import { BaseHealthController, HealthPrivateNetworkIpGuard } from '@app/backend-common-health';
import { InboundCallbackReplayGuard, RedisModule } from '@app/backend-common-redis';
import { DiscordExternalAuthAdapter } from './discord-external-auth.adapter';
import { DiscordInteractionsController } from './discord-interactions.controller';
import { DiscordAppApiHealthServiceProvider } from './health.config';
import { DiscordAuthModule } from './discord-auth.module';

@Module({
  imports: [
    DiscordAuthModule,
    RedisModule.forRoot(),
    // Bind the account service's external-auth port inside the bot module's
    // scope, delegating to the auth feature's ExternalAuthService via an
    // in-process adapter (DI, not HTTP).
    DiscordBotModule.forRoot({
      imports: [DiscordAuthModule],
      externalAuthProvider: {
        provide: DiscordAccountExternalAuthInjectToken,
        useClass: DiscordExternalAuthAdapter,
      },
    }),
  ],
  controllers: [BaseHealthController, DiscordInteractionsController],
  providers: [DiscordAppApiHealthServiceProvider, InboundCallbackReplayGuard, HealthPrivateNetworkIpGuard],
})
export class DiscordAppApiModule {}
