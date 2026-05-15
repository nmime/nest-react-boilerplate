import { Module } from "@nestjs/common";
import { AdminProfileController } from "./admin-profile.controller";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController, AdminProfileController],
})
export class AdminAppApiModule {}
