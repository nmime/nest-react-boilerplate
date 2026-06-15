import { Global, Module } from "@nestjs/common";
import { TELEGRAM_BOT_INSTANCE } from "./tokens";
import { createTelegramBot } from "./bot";
import { resolveTelegramBotConfig } from "./config";

@Global()
@Module({
  providers: [
    {
      provide: TELEGRAM_BOT_INSTANCE,
      useFactory: () => createTelegramBot(resolveTelegramBotConfig()),
    },
  ],
  exports: [TELEGRAM_BOT_INSTANCE],
})
export class TelegramBotModule {}
