import { DynamicModule, Module, type ModuleMetadata } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationRecipientResolver, NotificationService } from '@app/backend-feature-notification-shared';
import { AuthPostgresModule } from '@app/backend-postgres-main-auth';
import { NotificationPostgresModule } from '@app/backend-postgres-main-notification';
import { PostgresMainModule, type PostgresMikroOrmOverrides } from '@app/backend-postgres-main';
import { NotificationConfigService, NotificationHealthConfigService } from './config';
import { NotificationController } from './controller';
import { MessagesModule } from './messages';
import {
  NotificationApplicationService,
  NotificationDeliverySchedulerService,
  NotificationDeliveryPartitionService,
  NotificationHealthService,
  NotificationRecipientResolverService,
  NotificationStrategyResolverService,
} from './service';
import {
  BotChannelStrategy,
  ChannelStrategyResolver,
  TelegramChatNotificationStrategy,
  UserNotificationStrategy,
} from './strategy';

export interface NotificationMainModuleOptions {
  /** Modules that provide selected transport implementations to the worker. */
  imports?: NonNullable<ModuleMetadata['imports']>;
  postgres?: PostgresMikroOrmOverrides;
  /** Run the delivery queue and partition maintenance in this process. */
  enableWorker?: boolean;
  /** Expose the reference notification creation endpoints in this process. */
  exposeHttp?: boolean;
}

@Module({})
export class NotificationMainModule {
  static forRoot(options: NotificationMainModuleOptions = {}): DynamicModule {
    if (process.env['NODE_ENV'] === 'test') {
      return { module: NotificationMainModule };
    }

    const enableWorker = options.enableWorker ?? false;
    const exposeHttp = options.exposeHttp ?? false;

    return {
      module: NotificationMainModule,
      imports: [
        ...(options.imports ?? []),
        ConfigModule,
        PostgresMainModule.forRoot(options.postgres),
        NotificationPostgresModule,
        ...(enableWorker ? [ScheduleModule.forRoot(), AuthPostgresModule, MessagesModule] : []),
      ],
      controllers: exposeHttp ? [NotificationController] : [],
      providers: [
        NotificationConfigService,
        NotificationHealthConfigService,
        NotificationHealthService,
        NotificationApplicationService,
        { provide: NotificationService, useExisting: NotificationApplicationService },
        ...(enableWorker
          ? [
              NotificationRecipientResolverService,
              { provide: NotificationRecipientResolver, useExisting: NotificationRecipientResolverService },
              UserNotificationStrategy,
              TelegramChatNotificationStrategy,
              NotificationStrategyResolverService,
              NotificationDeliverySchedulerService,
              NotificationDeliveryPartitionService,
              BotChannelStrategy,
              ChannelStrategyResolver,
            ]
          : []),
      ],
      exports: [
        NotificationService,
        NotificationHealthService,
        ...(enableWorker ? [NotificationDeliverySchedulerService] : []),
      ],
    };
  }
}
