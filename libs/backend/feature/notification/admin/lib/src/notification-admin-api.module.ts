import { Module } from '@nestjs/common';
import { AuditLogAdminModule } from '@app/backend-feature-audit-log-admin';
import { NotificationMainModule } from '@app/backend-feature-notification-main';
import { AdminNotificationsController } from './admin-notifications.controller';

@Module({
  imports: [AuditLogAdminModule, NotificationMainModule.forRoot({ enableAdmin: true, exposeHttp: false })],
  controllers: [AdminNotificationsController],
})
export class NotificationAdminApiModule {}
