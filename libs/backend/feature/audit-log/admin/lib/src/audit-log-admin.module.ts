import { Module } from '@nestjs/common';
import { AuditLogAdminController } from './audit-log-admin.controller';
import { AuditLogAdminService } from './audit-log-admin.service';
import { AdminAccessAuditInterceptor } from './admin-access-audit.interceptor';

@Module({
  providers: [AuditLogAdminService, AdminAccessAuditInterceptor],
  exports: [AuditLogAdminService, AdminAccessAuditInterceptor],
})
export class AuditLogAdminModule {}

@Module({
  imports: [AuditLogAdminModule],
  controllers: [AuditLogAdminController],
  exports: [AuditLogAdminModule],
})
export class AuditLogAdminApiModule {}
