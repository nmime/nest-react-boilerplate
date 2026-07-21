import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { BaseHealthController, HealthPrivateNetworkIpGuard } from '@app/backend-common-health';
import { AdminMainModule } from '@app/backend-feature-admin-main';
import { AuthAdminModule } from '@app/backend-feature-auth-admin';
import { AdminAccessAuditInterceptor, AuditLogAdminApiModule } from '@app/backend-feature-audit-log-admin';
import { NotificationAdminApiModule } from '@app/backend-feature-notification-admin';
import { AdminAppHealthServiceProvider } from './health.config';
import { AdminAppApiCapabilitiesModule } from './capabilities.generated';

@Module({
  imports: [
    AdminMainModule,
    AuthAdminModule,
    AuditLogAdminApiModule,
    NotificationAdminApiModule,
    AdminAppApiCapabilitiesModule,
  ],
  controllers: [BaseHealthController],
  providers: [
    AdminAppHealthServiceProvider,
    HealthPrivateNetworkIpGuard,
    { provide: APP_INTERCEPTOR, useClass: AdminAccessAuditInterceptor },
  ],
})
export class AdminAppApiModule {}
