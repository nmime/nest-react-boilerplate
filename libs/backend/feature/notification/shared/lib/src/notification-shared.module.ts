import { DynamicModule, Provider } from '@nestjs/common';
import { NotificationService } from './notification-service';
import { NotificationSyncModule, NotificationSyncService } from './module';

export class NotificationSharedModule {
  static forRoot(): DynamicModule {
    const provider: Provider = {
      provide: NotificationService,
      useExisting: NotificationSyncService,
    };

    return {
      module: NotificationSharedModule,
      imports: [NotificationSyncModule],
      providers: [provider],
      exports: [provider, NotificationSyncModule],
    };
  }
}
