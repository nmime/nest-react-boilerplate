import { Module } from "@nestjs/common";
import {
  BaseHealthController,
  HealthPrivateNetworkIpGuard,
} from "@app/backend/common/health";
import { TelegramBotModule } from "@app/backend/bots/telegram";
import { TelegramBotApiHealthServiceProvider } from "./health.config";
import { TelegramWebhookController } from "./telegram-webhook.controller";

@Module({
  imports: [TelegramBotModule],
  controllers: [BaseHealthController, TelegramWebhookController],
  providers: [TelegramBotApiHealthServiceProvider, HealthPrivateNetworkIpGuard],
})
export class TelegramBotApiModule {}
