import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationSharedModule } from '@app/common-notification';
import {
  NotificationPostgresModule,
  NotificationRepository,
  NotificationTemplateRepository,
  NotificationDeliveryRepository,
} from '@app/backend-postgres-main-notification';
import { NotificationConfigService, NotificationHealthConfigService } from './config';
import {
  NotificationHealthService,
  NotificationStrategyResolverService,
  UserNotificationSchedulerService,
} from './service';
import { MessagesModule, MessageStrategyResolver } from './messages';
import {
  BotChannelStrategy,
  ChannelStrategyResolver,
  TelegramChatNotificationStrategy,
  UserNotificationStrategy,
} from './strategy';
import { NotificationController } from './controller';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    NotificationSharedModule.forRoot(),
    NotificationPostgresModule,
    MessagesModule,
  ],
  providers: [
    NotificationConfigService,
    NotificationHealthConfigService,
    NotificationHealthService,
    NotificationStrategyResolverService,
    NotificationController,
    UserNotificationSchedulerService,
    MessageStrategyResolver,
    BotChannelStrategy,
    ChannelStrategyResolver,
    UserNotificationStrategy,
    TelegramChatNotificationStrategy,
    NotificationRepository,
    NotificationTemplateRepository,
    NotificationDeliveryRepository,
  ],
  exports: [NotificationHealthService, UserNotificationSchedulerService],
})
export class NotificationMainModule {}
