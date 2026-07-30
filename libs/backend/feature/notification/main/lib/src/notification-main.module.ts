import { DynamicModule, Global, Module, type ModuleMetadata } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { S3Module } from '@app/backend-common-s3';
import {
  NotificationAdminServiceInjectToken,
  NotificationRecipientResolver,
  NotificationService,
} from '@app/backend-feature-notification-shared';
import { NotificationConfigService, NotificationHealthConfigService } from './config';
import { NotificationController } from './controller';
import { MessagesModule } from './messages';
import {
  NotificationApplicationService,
  NotificationAdminService,
  AuthUsersNotificationSegmentResolver,
  NotificationBroadcastSchedulerService,
  NotificationConsumerService,
  NotificationCsvService,
  NotificationDeliverySchedulerService,
  NotificationDeliveryPartitionService,
  NotificationHealthService,
  NotificationProviderReadinessService,
  NotificationRecipientResolverService,
  NotificationStrategyResolverService,
  NotificationSegmentResolverRegistry,
} from './service';
import {
  DiscordBotNotificationProvider,
  MailPaceEmailNotificationProvider,
  NotificationProviderResolver,
  ResendEmailNotificationProvider,
  TelegramBotNotificationProvider,
  GoogleFcmNotificationProvider,
  AppleApnsNotificationProvider,
  TelegramChatNotificationStrategy,
  UserNotificationStrategy,
} from './strategy';

export interface NotificationMainModuleOptions {
  /** Modules that provide selected transport implementations to the scheduler. */
  imports?: NonNullable<ModuleMetadata['imports']>;
  /** Register delivery and partition jobs in a scheduler process. */
  enableScheduler?: boolean;
  /** Register CSV, snapshot, and broadcast materialization work in a consumer process. */
  enableConsumer?: boolean;
  /** Register admin orchestration without exposing HTTP controllers. */
  enableAdmin?: boolean;
  /** Expose the reference notification creation endpoints in this process. */
  exposeHttp?: boolean;
}

@Global()
@Module({})
export class NotificationMainModule {
  // Dynamic composition intentionally keeps all process-role and persistence combinations in one public entrypoint.
  static forRoot(options: NotificationMainModuleOptions = {}): DynamicModule {
    if (
      process.env['NODE_ENV'] === 'test' &&
      !options.enableAdmin &&
      !options.enableConsumer &&
      !options.enableScheduler &&
      !options.exposeHttp
    ) {
      return { module: NotificationMainModule };
    }

    const enableScheduler = options.enableScheduler ?? false;
    const enableConsumer = options.enableConsumer ?? false;
    const enableAdmin = options.enableAdmin ?? false;
    const exposeHttp = options.exposeHttp ?? false;
    return {
      module: NotificationMainModule,
      imports: [
        ...(options.imports ?? []),
        ConfigModule,
        ...(enableScheduler ? [MessagesModule] : []),
        ...(enableConsumer || enableAdmin ? [S3Module.forRoot()] : []),
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
              NotificationBroadcastSchedulerService,
              NotificationDeliveryPartitionService,
              TelegramBotNotificationProvider,
              DiscordBotNotificationProvider,
              ResendEmailNotificationProvider,
              MailPaceEmailNotificationProvider,
              GoogleFcmNotificationProvider,
              AppleApnsNotificationProvider,
              NotificationProviderResolver,
              NotificationProviderReadinessService,
            ]
          : []),
        ...(enableConsumer || enableAdmin
          ? [
              AuthUsersNotificationSegmentResolver,
              NotificationSegmentResolverRegistry,
              NotificationCsvService,
              ...(enableConsumer ? [NotificationConsumerService] : []),
              ...(enableAdmin
                ? [
                    NotificationAdminService,
                    { provide: NotificationAdminServiceInjectToken, useExisting: NotificationAdminService },
                  ]
                : []),
            ]
          : []),
      ],
      exports: [
        NotificationService,
        NotificationHealthService,
        ...(enableScheduler
          ? [
              NotificationDeliverySchedulerService,
              NotificationBroadcastSchedulerService,
              NotificationProviderReadinessService,
            ]
          : []),
        ...(enableConsumer ? [NotificationConsumerService] : []),
        ...(enableAdmin ? [NotificationAdminServiceInjectToken] : []),
      ],
    };
  }
}
