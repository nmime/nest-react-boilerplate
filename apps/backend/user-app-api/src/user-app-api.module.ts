import { Module } from "@nestjs/common";
import {
  BaseHealthController,
  HealthPrivateNetworkIpGuard,
} from "@app/backend/common/health";
import { UserMainModule } from "@app/backend/feature/user/main";
import { UserAppHealthServiceProvider } from "./health.config";

@Module({
  imports: [UserMainModule],
  controllers: [BaseHealthController],
  providers: [UserAppHealthServiceProvider, HealthPrivateNetworkIpGuard],
})
export class UserAppApiModule {}
