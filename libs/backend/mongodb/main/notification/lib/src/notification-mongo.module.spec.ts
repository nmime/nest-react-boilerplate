// @requirements REQ-NOTIFY-PERSISTENCE-005
import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  NotificationBroadcastPersistence,
  NotificationDeliveryPartitionMaintenance,
  NotificationPersistence,
} from '@app/backend-feature-notification-shared';
import { describe, expect, it, vi } from 'vitest';
import { MongoClientToken, MongoDatabaseToken, verifyAppliedMongoMigrations } from './mongo-runtime';
import { NotificationMongoModule, NotificationMongoPersistenceModule } from './notification-mongo.module';
import { notificationMongoMigrations } from './migrations';

vi.mock('./mongo-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./mongo-runtime')>()),
  verifyAppliedMongoMigrations: vi.fn().mockResolvedValue(undefined),
}));

const database = { collection: vi.fn(() => ({})) };
@Global()
@Module({
  providers: [
    { provide: MongoDatabaseToken, useValue: database },
    { provide: MongoClientToken, useValue: {} },
  ],
  exports: [MongoDatabaseToken, MongoClientToken],
})
class DatabaseTestModule {}

describe('Mongo notification module contract', () => {
  it('exposes the neutral persistence ports and verifies migrations before readiness', async () => {
    const application = await Test.createTestingModule({
      imports: [DatabaseTestModule, NotificationMongoPersistenceModule],
    }).compile();
    try {
      await application.init();
      expect(verifyAppliedMongoMigrations).toHaveBeenCalledWith(database, notificationMongoMigrations);
      expect(application.get(NotificationPersistence)).toBeDefined();
      expect(application.get(NotificationBroadcastPersistence)).toBeDefined();
      await expect(
        application.get(NotificationDeliveryPartitionMaintenance).ensurePartitions(1),
      ).resolves.toBeUndefined();
      expect(
        NotificationMongoModule.forRoot({
          env: {
            MONGODB_URI: 'mongodb://127.0.0.1:27017/test?replicaSet=rs0',
            MONGODB_DATABASE: 'test',
            MONGODB_REPLICA_SET: 'rs0',
          },
        }).exports,
      ).toEqual([NotificationMongoPersistenceModule]);
    } finally {
      await application.close();
    }
  });
});
