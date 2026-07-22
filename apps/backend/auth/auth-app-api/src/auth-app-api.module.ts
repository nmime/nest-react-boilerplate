import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BaseHealthController, HealthPrivateNetworkIpGuard } from '@app/backend-common-health';
import { AuthMainModule, PersistentSessionAccessGuard } from '@app/backend-feature-auth-main';
import { AuthAppHealthServiceProvider } from './health.config';
import { AuthAppApiCapabilitiesModule } from './capabilities.generated';

@Module({
  imports: [AuthMainModule.forRoot(), AuthAppApiCapabilitiesModule],
  controllers: [BaseHealthController],
  providers: [
    AuthAppHealthServiceProvider,
    HealthPrivateNetworkIpGuard,
    { provide: APP_GUARD, useExisting: PersistentSessionAccessGuard },
  ],
})
export class AuthAppApiModule {}
