import { Module } from '@nestjs/common';
import { BaseHealthController, HealthPrivateNetworkIpGuard } from '@app/backend-common-health';
import { AdminMainModule } from '@app/backend-feature-admin-main';
import { AdminAppHealthServiceProvider } from './health.config';
import { AdminAppApiCapabilitiesModule } from './capabilities.generated';

@Module({
  imports: [AdminMainModule, AdminAppApiCapabilitiesModule],
  controllers: [BaseHealthController],
  providers: [AdminAppHealthServiceProvider, HealthPrivateNetworkIpGuard],
})
export class AdminAppApiModule {}
