import { DynamicModule, Global, Module, type ModuleMetadata } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
  DiscordBotNotificationProvider,
  MailPaceEmailNotificationProvider,
  NotificationProviderResolver,
  ResendEmailNotificationProvider,
  TelegramBotNotificationProvider,
  TelegramChatNotificationStrategy,
  UserNotificationStrategy,
} from './strategy';

export interface NotificationMainModuleOptions {
  /** Modules that provide selected transport implementations to the scheduler. */
  imports?: NonNullable<ModuleMetadata['imports']>;
  postgres?: PostgresMikroOrmOverrides;
  /** Register delivery and partition jobs in a scheduler process. */
  enableScheduler?: boolean;
  /** Expose the reference notification creation endpoints in this process. */
  exposeHttp?: boolean;
}

@Global()
@Module({})
export class NotificationMainModule {
  static forRoot(options: NotificationMainModuleOptions = {}): DynamicModule {
    if (process.env['NODE_ENV'] === 'test') {
      return { module: NotificationMainModule };
    }

    const enableScheduler = options.enableScheduler ?? false;
    const exposeHttp = options.exposeHttp ?? false;

    return {
      module: NotificationMainModule,
      imports: [
        ...(options.imports ?? []),
        ConfigModule,
        PostgresMainModule.forRoot(options.postgres),
        NotificationPostgresModule,
        ...(enableScheduler ? [AuthPostgresModule, MessagesModule] : []),
      ],
      controllers: exposeHttp ? [NotificationController] : [],
      providers: [
        NotificationConfigService,
        NotificationHealthConfigService,
        NotificationHealthService,
        NotificationApplicationService,
        { provide: NotificationService, useExisting: NotificationApplicationService },
        ...(enableScheduler
          ? [
              NotificationRecipientResolverService,
              { provide: NotificationRecipientResolver, useExisting: NotificationRecipientResolverService },
              UserNotificationStrategy,
              TelegramChatNotificationStrategy,
              NotificationStrategyResolverService,
              NotificationDeliverySchedulerService,
              NotificationDeliveryPartitionService,
              TelegramBotNotificationProvider,
              DiscordBotNotificationProvider,
              ResendEmailNotificationProvider,
              MailPaceEmailNotificationProvider,
              NotificationProviderResolver,
            ]
          : []),
      ],
      exports: [
        NotificationService,
        NotificationHealthService,
        ...(enableScheduler ? [NotificationDeliverySchedulerService] : []),
      ],
    };
  }
}
