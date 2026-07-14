import { DynamicModule, Module } from '@nestjs/common';
import { BaseHealthController, HealthPrivateNetworkIpGuard } from '@app/backend-common-health';
import { resolveTelegramBotConfig, TelegramBotModule } from '@app/backend-feature-telegram-bot';
import { NotificationMainModule } from '@app/backend-feature-notification';
import { TelegramBotApiHealthServiceProvider } from './health.config';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramPollingService } from './telegram-polling.service';

@Module({})
export class TelegramBotApiModule {
  static register(): DynamicModule {
    const config = resolveTelegramBotConfig();
    const usePolling = config.mode === 'polling';
    const useWebhook = config.mode === 'webhook';

    return {
      module: TelegramBotApiModule,
      imports: [TelegramBotModule, NotificationMainModule.forRoot()],
      controllers: [BaseHealthController, ...(useWebhook ? [TelegramWebhookController] : [])],
      providers: [
        TelegramBotApiHealthServiceProvider,
        HealthPrivateNetworkIpGuard,
        ...(usePolling ? [TelegramPollingService] : []),
      ],
    };
  }
}
