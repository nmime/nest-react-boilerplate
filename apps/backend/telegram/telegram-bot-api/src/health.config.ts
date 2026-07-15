import type { Provider } from '@nestjs/common';
import { EnvHealthIndicator, HealthService, RuntimeHealthIndicator } from '@app/backend-common-health';

const appName = 'telegram-bot-api';

export const TelegramBotApiHealthServiceProvider: Provider = {
  provide: HealthService,
  useValue: new HealthService({
    appName,
    indicators: [
      new RuntimeHealthIndicator(),
      new EnvHealthIndicator({
        name: 'telegram-bot-config',
        required: true,
        requiredVariables: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_WEBHOOK_SECRET'],
        optionalVariables: ['TELEGRAM_BOT_MODE', 'TELEGRAM_BOT_WEBHOOK_URL', 'REDIS_URL'],
      }),
    ],
  }),
};
