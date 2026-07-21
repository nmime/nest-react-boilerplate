import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { NotificationBroadcastPersistence, NotificationPersistence } from '@app/backend-feature-notification-shared';
import {
  NotificationAudienceSnapshotEntitySchema,
  NotificationAudienceSnapshotMemberEntitySchema,
  NotificationBroadcastCommandEntitySchema,
  NotificationBroadcastEntitySchema,
  NotificationBroadcastSegmentEntitySchema,
  NotificationDeliveryEntitySchema,
  NotificationEntitySchema,
  NotificationSegmentEntitySchema,
  NotificationSegmentMemberEntitySchema,
  NotificationSegmentUploadEntitySchema,
  NotificationTemplateEntitySchema,
  NotificationTemplateVersionChannelEntitySchema,
  NotificationTemplateVersionEntitySchema,
} from '../infrastructure/data-access/entities';
import { PostgresNotificationBroadcastPersistence, PostgresNotificationPersistence } from '../repositories';
import { NotificationPayloadCryptoService } from '../notification-payload-crypto.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      NotificationEntitySchema,
      NotificationTemplateEntitySchema,
      NotificationTemplateVersionEntitySchema,
      NotificationTemplateVersionChannelEntitySchema,
      NotificationDeliveryEntitySchema,
      NotificationSegmentEntitySchema,
      NotificationSegmentMemberEntitySchema,
      NotificationSegmentUploadEntitySchema,
      NotificationBroadcastEntitySchema,
      NotificationBroadcastSegmentEntitySchema,
      NotificationAudienceSnapshotEntitySchema,
      NotificationAudienceSnapshotMemberEntitySchema,
      NotificationBroadcastCommandEntitySchema,
    ]),
  ],
  providers: [
    NotificationPayloadCryptoService,
    PostgresNotificationPersistence,
    PostgresNotificationBroadcastPersistence,
    { provide: NotificationPersistence, useExisting: PostgresNotificationPersistence },
    { provide: NotificationBroadcastPersistence, useExisting: PostgresNotificationBroadcastPersistence },
  ],
  exports: [
    MikroOrmModule,
    NotificationPersistence,
    NotificationBroadcastPersistence,
    NotificationPayloadCryptoService,
  ],
})
export class NotificationPostgresModule {}
