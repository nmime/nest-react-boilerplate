import { Module } from '@nestjs/common';
import { BaseHealthController, HealthPrivateNetworkIpGuard } from '@app/backend-common-health';
import { AdminMainModule } from '@app/backend-feature-admin-main';
import { NotificationMainModule } from '@app/backend-feature-notification';
import { AdminAppHealthServiceProvider } from './health.config';

@Module({
  imports: [AdminMainModule, NotificationMainModule.forRoot()],
  controllers: [BaseHealthController],
  providers: [AdminAppHealthServiceProvider, HealthPrivateNetworkIpGuard],
})
export class AdminAppApiModule {}
