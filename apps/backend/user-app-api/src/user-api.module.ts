import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { ProfileController } from "./profile.controller";

@Module({
  controllers: [HealthController, ProfileController],
})
export class UserApiModule {}
