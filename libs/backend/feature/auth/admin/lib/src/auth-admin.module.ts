import { Module } from '@nestjs/common';
import { AuthPostgresModule } from '@app/backend-postgres-main-auth';
import { AuthLoginAnalyticsAdminController } from './auth-login-analytics-admin.controller';
import { AuthLoginAnalyticsAdminService } from './auth-login-analytics-admin.service';

@Module({
  imports: [AuthPostgresModule],
  controllers: [AuthLoginAnalyticsAdminController],
  providers: [AuthLoginAnalyticsAdminService],
  exports: [AuthLoginAnalyticsAdminService],
})
export class AuthAdminModule {}
