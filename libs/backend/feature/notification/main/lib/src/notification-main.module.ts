import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PostgresMainModule, type PostgresMikroOrmOverrides } from '@app/backend-postgres-main';
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

export interface NotificationMainModuleOptions {
  postgres?: PostgresMikroOrmOverrides;
}

@Module({})
export class NotificationMainModule {
  static forRoot(options: NotificationMainModuleOptions = {}): DynamicModule {
    const isTestRuntime = process.env['NODE_ENV'] === 'test';

    if (isTestRuntime) {
      return { module: NotificationMainModule };
    }

    return {
      module: NotificationMainModule,
      imports: [
        ConfigModule,
        PostgresMainModule.forRoot(options.postgres),
        ScheduleModule.forRoot(),
        NotificationSharedModule.forRoot(),
        NotificationPostgresModule,
        MessagesModule,
      ],
      controllers: [NotificationController],
      providers: [
        NotificationConfigService,
        NotificationHealthConfigService,
        NotificationHealthService,
        NotificationStrategyResolverService,
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
    };
  }
}
