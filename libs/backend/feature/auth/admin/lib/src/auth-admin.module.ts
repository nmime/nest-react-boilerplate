import { Module } from '@nestjs/common';
import { AuthLoginAnalyticsAdminController } from './auth-login-analytics-admin.controller';
import { AuthLoginAnalyticsAdminService } from './auth-login-analytics-admin.service';

@Module({
  controllers: [AuthLoginAnalyticsAdminController],
  providers: [AuthLoginAnalyticsAdminService],
  exports: [AuthLoginAnalyticsAdminService],
})
export class AuthAdminModule {}
