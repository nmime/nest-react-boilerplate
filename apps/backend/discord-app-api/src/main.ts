import {
  bootstrapNestApi,
  resolveDefaultDevelopmentCorsOrigins,
} from "@app/common/bootstrap";
import { DiscordAppApiModule } from "./discord-app-api.module";

void bootstrapNestApi(DiscordAppApiModule, {
  appName: "discord-app-api",
  corsOrigins: resolveDefaultDevelopmentCorsOrigins(),
  defaultPort: 3007,
});
