import { Module } from "@nestjs/common";
import {
  BaseHealthController,
  HealthPrivateNetworkIpGuard,
} from "@app/backend/common/health";
import { AdminMainModule } from "@app/backend/feature/admin/main";
import { AdminAppHealthServiceProvider } from "./health.config";

@Module({
  imports: [AdminMainModule],
  controllers: [BaseHealthController],
  providers: [AdminAppHealthServiceProvider, HealthPrivateNetworkIpGuard],
})
export class AdminAppApiModule {}
