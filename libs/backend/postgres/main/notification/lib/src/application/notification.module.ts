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
import { NotificationPayloadCryptoService } from '../notification-payload-crypto.service';

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
    NotificationPayloadCryptoService,
    PostgresNotificationPersistence,
    { provide: NotificationPersistence, useExisting: PostgresNotificationPersistence },
  ],
  exports: [MikroOrmModule, NotificationPersistence, NotificationPayloadCryptoService],
})
export class NotificationPostgresModule {}
