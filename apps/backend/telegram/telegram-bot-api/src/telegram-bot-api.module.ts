import { DynamicModule, Module } from '@nestjs/common';
import { BaseHealthController, HealthPrivateNetworkIpGuard } from '@app/backend-common-health';
import { RedisModule } from '@app/backend-common-redis';
import { resolveTelegramBotConfig, TelegramBotModule } from '@app/backend-feature-telegram-bot';
import { TelegramBotApiHealthServiceProvider } from './health.config';
import { TelegramBotApiCapabilitiesModule } from './capabilities.generated';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramPollingService } from './telegram-polling.service';
import { TelegramUpdateReplayProtection } from './telegram-update-replay-protection';

@Module({})
export class TelegramBotApiModule {
  static register(): DynamicModule {
    const config = resolveTelegramBotConfig();
    const usePolling = config.mode === 'polling';
    const useWebhook = config.mode === 'webhook';

    return {
      module: TelegramBotApiModule,
      imports: [TelegramBotModule, TelegramBotApiCapabilitiesModule, ...(useWebhook ? [RedisModule.forRoot()] : [])],
      controllers: [BaseHealthController, ...(useWebhook ? [TelegramWebhookController] : [])],
      providers: [
        TelegramBotApiHealthServiceProvider,
        HealthPrivateNetworkIpGuard,
        ...(useWebhook ? [TelegramUpdateReplayProtection] : []),
        ...(usePolling ? [TelegramPollingService] : []),
      ],
    };
  }
}
