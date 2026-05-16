import { Module } from "@nestjs/common";
import { AdminMainModule } from "@app/features-admin-main";
import { HealthController } from "./health.controller";

@Module({
  imports: [AdminMainModule],
  controllers: [HealthController],
})
export class AdminAppApiModule {}
