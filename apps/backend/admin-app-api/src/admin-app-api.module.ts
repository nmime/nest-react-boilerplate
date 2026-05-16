import { Module } from "@nestjs/common";
import { AdminMainModule } from "@app/feature-admin-main";
import { HealthController } from "./health.controller";

@Module({
  imports: [AdminMainModule],
  controllers: [HealthController],
})
export class AdminAppApiModule {}
