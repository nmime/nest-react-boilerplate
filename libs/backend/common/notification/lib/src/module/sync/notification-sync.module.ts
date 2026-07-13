import { Module } from '@nestjs/common';
import { NotificationSyncService } from './notification-sync.service';
import {
  NotificationPostgresModule,
  NotificationRepository,
  NotificationTemplateRepository,
  NotificationDeliveryRepository,
} from '@app/backend-postgres-main-notification';

@Module({
  imports: [NotificationPostgresModule],
  providers: [NotificationRepository, NotificationTemplateRepository, NotificationDeliveryRepository, NotificationSyncService],
  exports: [NotificationSyncService],
})
export class NotificationSyncModule {}
