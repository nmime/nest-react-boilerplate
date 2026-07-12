import { DynamicModule, Module } from '@nestjs/common';
import {
  BaseHealthController,
  HealthPrivateNetworkIpGuard,
} from '@app/backend-common-health';
import {
  resolveTelegramBotConfig,
  TelegramBotModule,
} from '@app/backend-feature-telegram-bot';
import { TelegramBotApiHealthServiceProvider } from './health.config';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { TelegramPollingService } from './telegram-polling.service';

// Read the transport mode at import time (when env vars are available).
// Falls back to webhook mode in test/CI where env may be partial.
function detectMode(): 'webhook' | 'polling' {
  try {
    return resolveTelegramBotConfig().mode;
  } catch {
    // TELEGRAM_BOT_TOKEN not set — default to webhook so the module
    // can be imported in tests/CI without requiring real credentials.
    return 'webhook';
  }
}

const mode = detectMode();
const usePolling = mode === 'polling';
const useWebhook = mode === 'webhook';

@Module({
  imports: [TelegramBotModule],
  controllers: [
    BaseHealthController,
    ...(useWebhook ? [TelegramWebhookController] : []),
  ],
  providers: [
    TelegramBotApiHealthServiceProvider,
    HealthPrivateNetworkIpGuard,
    ...(usePolling ? [TelegramPollingService] : []),
  ],
})
export class TelegramBotApiModule {}
