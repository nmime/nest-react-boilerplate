import { Module } from "@nestjs/common";
import { DiscordBotModule } from "@app/backend-bot-discord";
import { AuthMainModule } from "@app/feature-auth-main";
import { DiscordInteractionsController } from "./discord-interactions.controller";

@Module({
  imports: [AuthMainModule.forRoot(), DiscordBotModule],
  controllers: [DiscordInteractionsController],
})
export class DiscordAppApiModule {}
