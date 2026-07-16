import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { NotificationPersistence } from '@app/backend-feature-notification-shared';
import {
  NotificationDeliveryEntitySchema,
  NotificationEntitySchema,
  NotificationTemplateChannelEntitySchema,
  NotificationTemplateEntitySchema,
} from '../infrastructure/data-access/entities';
import { PostgresNotificationPersistence } from '../repositories';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      NotificationEntitySchema,
      NotificationTemplateEntitySchema,
      NotificationTemplateChannelEntitySchema,
      NotificationDeliveryEntitySchema,
    ]),
  ],
  providers: [
    PostgresNotificationPersistence,
    { provide: NotificationPersistence, useExisting: PostgresNotificationPersistence },
  ],
  exports: [MikroOrmModule, NotificationPersistence],
})
export class NotificationPostgresModule {}
