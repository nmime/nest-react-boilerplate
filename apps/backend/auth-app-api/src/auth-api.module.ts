import { Module } from "@nestjs/common";
import { BaseHealthController, HealthPrivateNetworkIpGuard } from "@app/common/health";
import { AuthMainModule } from "@app/feature-auth-main";
import { AuthAppHealthServiceProvider } from "./health.config";

@Module({
  imports: [AuthMainModule.forRoot()],
  controllers: [BaseHealthController],
  providers: [AuthAppHealthServiceProvider, HealthPrivateNetworkIpGuard],
})
export class AuthApiModule {}
