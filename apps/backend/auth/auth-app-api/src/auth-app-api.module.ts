import { Module } from '@nestjs/common';
import { BaseHealthController, HealthPrivateNetworkIpGuard } from '@app/backend-common-health';
import { AuthMainModule } from '@app/backend-feature-auth-main';
import { AuthAppHealthServiceProvider } from './health.config';
import { AuthAppApiCapabilitiesModule } from './capabilities.generated';

@Module({
  imports: [AuthMainModule.forRoot(), AuthAppApiCapabilitiesModule],
  controllers: [BaseHealthController],
  providers: [AuthAppHealthServiceProvider, HealthPrivateNetworkIpGuard],
})
export class AuthAppApiModule {}
