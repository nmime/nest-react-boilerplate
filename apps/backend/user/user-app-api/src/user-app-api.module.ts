import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BaseHealthController, HealthPrivateNetworkIpGuard } from '@app/backend-common-health';
import { UserMainModule } from '@app/backend-feature-user-main';
import { PostgresMainModule } from '@app/backend-postgres-main';
import { AuthPostgresModule } from '@app/backend-postgres-main-auth';
import { UserAppHealthServiceProvider } from './health.config';
import { UserAppApiCapabilitiesModule } from './capabilities.generated';
import { UserDatabaseSessionAccessGuard } from './user-database-session-access.guard';

@Module({
  imports: [PostgresMainModule.forRoot(), AuthPostgresModule, UserMainModule, UserAppApiCapabilitiesModule],
  controllers: [BaseHealthController],
  providers: [
    UserAppHealthServiceProvider,
    HealthPrivateNetworkIpGuard,
    UserDatabaseSessionAccessGuard,
    { provide: APP_GUARD, useExisting: UserDatabaseSessionAccessGuard },
  ],
})
export class UserAppApiModule {}
