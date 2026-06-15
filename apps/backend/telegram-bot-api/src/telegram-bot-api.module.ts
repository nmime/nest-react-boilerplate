import { Module } from "@nestjs/common";
import {
  BaseHealthController,
  HealthPrivateNetworkIpGuard,
  HealthService,
  RuntimeHealthIndicator,
  EnvHealthIndicator,
} from "@app/common/health";
import { TelegramBotModule } from "@app/backend-bot-telegram";
import { TelegramWebhookController } from "./telegram-webhook.controller";

@Module({
  imports: [TelegramBotModule],
  controllers: [BaseHealthController, TelegramWebhookController],
  providers: [
    HealthPrivateNetworkIpGuard,
    {
      provide: HealthService,
      useValue: new HealthService({
        appName: "telegram-bot-api",
        indicators: [
          new RuntimeHealthIndicator(),
          new EnvHealthIndicator({
            name: "telegram-bot-config",
            required: true,
            requiredVariables: [
              "TELEGRAM_BOT_TOKEN",
              "TELEGRAM_WEBHOOK_SECRET",
            ],
            optionalVariables: ["TELEGRAM_BOT_MODE", "REDIS_URL"],
          }),
        ],
      }),
    },
  ],
})
export class TelegramBotApiModule {}
