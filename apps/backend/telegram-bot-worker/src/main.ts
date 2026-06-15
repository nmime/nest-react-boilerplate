import { bootstrap } from "@app/common/bootstrap";
import { TelegramBotWorkerModule } from "./telegram-bot-worker.module";

void bootstrap({
  name: "telegram-bot-worker",
  module: TelegramBotWorkerModule,
  port: 3023,
});
