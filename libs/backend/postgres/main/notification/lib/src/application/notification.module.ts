import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import {
  NotificationDeliveryEntitySchema,
  NotificationEntitySchema,
  NotificationTemplateChannelEntitySchema,
  NotificationTemplateEntitySchema,
} from '../infrastructure/data-access/entities';
import {
  NotificationDeliveryRepository,
  NotificationRepository,
  NotificationTemplateRepository,
} from '../repositories';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      NotificationEntitySchema,
      NotificationTemplateEntitySchema,
      NotificationTemplateChannelEntitySchema,
      NotificationDeliveryEntitySchema,
    ]),
  ],
  providers: [NotificationRepository, NotificationTemplateRepository, NotificationDeliveryRepository],
  exports: [MikroOrmModule, NotificationRepository, NotificationTemplateRepository, NotificationDeliveryRepository],
})
export class NotificationPostgresModule {}
