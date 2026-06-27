import { Module } from "@nestjs/common";
import { DiscordBotModule } from "@app/backend/bots/discord";
import { AuthMainModule } from "@app/backend/feature/auth/main";
import { DiscordInteractionsController } from "./discord-interactions.controller";

@Module({
  imports: [AuthMainModule.forRoot(), DiscordBotModule],
  controllers: [DiscordInteractionsController],
})
export class DiscordAppApiModule {}
