import { Module } from "@nestjs/common";
import { AuthOAuthModule } from "@app/features-auth-oauth";
import { HealthController } from "./health.controller";

@Module({
  imports: [AuthOAuthModule],
  controllers: [HealthController],
})
export class AuthApiModule {}
