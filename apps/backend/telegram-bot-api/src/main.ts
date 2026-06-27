import {
  bootstrapNestApi,
  resolveDefaultDevelopmentCorsOrigins,
} from "@app/backend/common/bootstrap";
import { TelegramBotApiModule } from "./telegram-bot-api.module";

void bootstrapNestApi(TelegramBotApiModule, {
  appName: "telegram-bot-api",
  corsOrigins: resolveDefaultDevelopmentCorsOrigins(),
  defaultPort: 3013,
});
