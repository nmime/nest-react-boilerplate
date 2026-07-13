import { Module } from "@nestjs/common";
import {
  BaseHealthController,
  HealthPrivateNetworkIpGuard,
} from "@app/backend-common-health";
import { UserMainModule } from "@app/backend-feature-user-main";
import { NotificationMainModule } from "@app/backend-feature-notification";
import { UserAppHealthServiceProvider } from "./health.config";

@Module({
  imports: [UserMainModule, NotificationMainModule],
  controllers: [BaseHealthController],
  providers: [UserAppHealthServiceProvider, HealthPrivateNetworkIpGuard],
})
export class UserAppApiModule {}
