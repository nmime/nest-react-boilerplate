import { Module } from "@nestjs/common";
import { AuthMainModule } from "@app/features-auth-main";
import { HealthController } from "./health.controller";

@Module({
  imports: [AuthMainModule.forRoot()],
  controllers: [HealthController],
})
export class AuthApiModule {}
