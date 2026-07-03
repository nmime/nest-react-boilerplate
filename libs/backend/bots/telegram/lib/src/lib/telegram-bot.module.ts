import { Global, Module } from "@nestjs/common";
import { TelegramBotInstanceInjectToken } from "./tokens";
import { createTelegramBot } from "./bot";
import { resolveTelegramBotConfig } from "./config";

@Global()
@Module({
  providers: [
    {
      provide: TelegramBotInstanceInjectToken,
      useFactory: () => createTelegramBot(resolveTelegramBotConfig()),
    },
  ],
  exports: [TelegramBotInstanceInjectToken],
})
export class TelegramBotModule {}
