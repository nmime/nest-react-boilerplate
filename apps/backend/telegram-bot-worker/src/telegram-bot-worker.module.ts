import { Module } from "@nestjs/common";
import { TelegramBotModule } from "@app/backend-bot-telegram";
import { TelegramBotWorkerService } from "./telegram-bot-worker.service";

@Module({
  imports: [TelegramBotModule],
  providers: [TelegramBotWorkerService],
})
export class TelegramBotWorkerModule {}
