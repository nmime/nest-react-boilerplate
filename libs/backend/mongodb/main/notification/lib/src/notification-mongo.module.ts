import { DynamicModule, Inject, Injectable, Module, type OnModuleInit } from '@nestjs/common';
import type { Db } from 'mongodb';
import {
  NotificationBroadcastPersistence,
  NotificationDeliveryPartitionMaintenance,
  NotificationPersistence,
} from '@app/backend-feature-notification-shared';
import {
  MongoDatabaseToken,
  MongoMainModule,
  type MongoModuleOptions,
  verifyAppliedMongoMigrations,
} from './mongo-runtime';
import { MongoNotificationBroadcastPersistence } from './mongo-notification-broadcast.persistence';
import { MongoNotificationPersistence } from './mongo-notification.persistence';
import { NotificationMongoPayloadCryptoService } from './notification-payload-crypto.service';
import { notificationMongoMigrations } from './migrations';

@Injectable()
class MongoNotificationDeliveryPartitionMaintenance extends NotificationDeliveryPartitionMaintenance {
  ensurePartitions(): Promise<void> {
    return Promise.resolve();
  }
}

@Injectable()
export class NotificationMongoMigrationVerifier implements OnModuleInit {
  constructor(@Inject(MongoDatabaseToken) private readonly database: Db) {}

  onModuleInit(): Promise<void> {
    return verifyAppliedMongoMigrations(this.database, notificationMongoMigrations);
  }
}

@Module({
  providers: [
    NotificationMongoMigrationVerifier,
    NotificationMongoPayloadCryptoService,
    MongoNotificationPersistence,
    MongoNotificationBroadcastPersistence,
    MongoNotificationDeliveryPartitionMaintenance,
    {
      provide: NotificationDeliveryPartitionMaintenance,
      useExisting: MongoNotificationDeliveryPartitionMaintenance,
    },
    { provide: NotificationPersistence, useExisting: MongoNotificationPersistence },
    { provide: NotificationBroadcastPersistence, useExisting: MongoNotificationBroadcastPersistence },
  ],
  exports: [NotificationPersistence, NotificationBroadcastPersistence, NotificationDeliveryPartitionMaintenance],
})
export class NotificationMongoPersistenceModule {}

@Module({})
export class NotificationMongoModule {
  static forRoot(mongo: MongoModuleOptions = {}): DynamicModule {
    return {
      module: NotificationMongoModule,
      imports: [MongoMainModule.forRoot(mongo), NotificationMongoPersistenceModule],
      exports: [NotificationMongoPersistenceModule],
    };
  }
}
