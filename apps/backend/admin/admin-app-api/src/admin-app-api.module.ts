import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BaseHealthController, HealthPrivateNetworkIpGuard } from '@app/backend-common-health';
import { AdminDatabaseAccessGuard, AdminMainModule } from '@app/backend-feature-admin-main';
import { AdminAuthenticationGuard } from '@app/backend-feature-admin-shared';
import { AuthAdminModule } from '@app/backend-feature-auth-admin';
import { AdminAccessAuditInterceptor, AuditLogAdminApiModule } from '@app/backend-feature-audit-log-admin';
import { NotificationAdminApiModule } from '@app/backend-feature-notification-admin';
import { AdminAppHealthServiceProvider } from './health.config';
import { AdminAppApiCapabilitiesModule } from './capabilities.generated';
import { AdminHealthController } from './admin-health.controller';

@Module({
  imports: [
    AdminMainModule,
    AuthAdminModule,
    AuditLogAdminApiModule,
    NotificationAdminApiModule,
    AdminAppApiCapabilitiesModule,
  ],
  controllers: [BaseHealthController, AdminHealthController],
  providers: [
    AdminAppHealthServiceProvider,
    HealthPrivateNetworkIpGuard,
    { provide: APP_GUARD, useClass: AdminAuthenticationGuard },
    { provide: APP_GUARD, useExisting: AdminDatabaseAccessGuard },
    { provide: APP_INTERCEPTOR, useClass: AdminAccessAuditInterceptor },
  ],
})
export class AdminAppApiModule {}
