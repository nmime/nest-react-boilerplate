import { Module } from "@nestjs/common";
import { UserMainModule } from "@app/features-user-main";
import { HealthController } from "./health.controller";

@Module({
  imports: [UserMainModule],
  controllers: [HealthController],
})
export class UserApiModule {}
