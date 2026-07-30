// @requirements REQ-NOTIFY-PERSISTENCE-005
import {
  NotificationBroadcastStatus,
  NotificationChannel,
  NotificationDeliveryProvider,
} from '@app/common-notifications';
import type { Db, MongoClient } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { NotificationMongoCollections, type NotificationBroadcastDocument } from './notification-mongo.documents';
import {
  mapBroadcastPriority,
  MongoNotificationBroadcastPersistence,
} from './mongo-notification-broadcast.persistence';
import { NotificationMongoPayloadCryptoService } from './notification-payload-crypto.service';

describe('Mongo notification adapter', () => {
  it('maps broadcast priority into the delivery queue range', () => {
    expect(mapBroadcastPriority(0)).toBe(9);
    expect(mapBroadcastPriority(10)).toBe(99);
  });

  it('encrypts sensitive data with authenticated context', () => {
    const crypto = new NotificationMongoPayloadCryptoService({
      NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    });
    const encrypted = crypto.encrypt({ code: 'secret' }, 'notification:1');
    expect(encrypted.ciphertext).not.toContain('secret');
    expect(crypto.decrypt(encrypted, 'notification:1')).toEqual({ code: 'secret' });
  });

  it('owns every durable notification collection', () => {
    expect(Object.keys(NotificationMongoCollections)).toHaveLength(13);
  });

  it.each([NotificationBroadcastStatus.Paused, NotificationBroadcastStatus.Cancelled])(
    'does not overwrite a concurrent %s transition with stale statistics',
    async (concurrentStatus) => {
      const broadcast = buildSendingBroadcast();
      let persistedStatus = broadcast.status;
      let releaseAggregation!: () => void;
      let markAggregationStarted!: () => void;
      const aggregationStarted = new Promise<void>((resolve) => {
        markAggregationStarted = resolve;
      });
      const aggregationReleased = new Promise<void>((resolve) => {
        releaseAggregation = resolve;
      });
      const updateOne = vi.fn(
        async (
          filter: { _id: string; status?: NotificationBroadcastStatus },
          update: { $set: { status: NotificationBroadcastStatus } },
        ) => {
          const matched =
            filter._id === broadcast._id && (filter.status === undefined || filter.status === persistedStatus);
          if (matched) {
            persistedStatus = update.$set.status;
          }
          return { matchedCount: matched ? 1 : 0 };
        },
      );
      const collections = {
        [NotificationMongoCollections.broadcasts]: {
          find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([broadcast]) })),
          updateOne,
        },
        [NotificationMongoCollections.deliveries]: {
          aggregate: vi.fn(() => ({
            toArray: vi.fn(async () => {
              markAggregationStarted();
              await aggregationReleased;
              return [];
            }),
          })),
        },
      };
      const database = {
        collection: vi.fn((name: string) => {
          if (name in collections) {
            return collections[name as keyof typeof collections];
          }
          return {};
        }),
      } as unknown as Db;
      const persistence = new MongoNotificationBroadcastPersistence(
        database,
        {} as MongoClient,
        notificationPayloadCrypto(),
      );

      const refresh = persistence.refreshBroadcastStatistics();
      await aggregationStarted;
      persistedStatus = concurrentStatus;
      releaseAggregation();
      await refresh;

      expect(persistedStatus).toBe(concurrentStatus);
      expect(updateOne).toHaveBeenCalledWith(
        { _id: broadcast._id, status: NotificationBroadcastStatus.Sending },
        expect.objectContaining({
          $set: expect.objectContaining({ status: NotificationBroadcastStatus.Completed }),
        }),
      );
    },
  );
});

function notificationPayloadCrypto(): NotificationMongoPayloadCryptoService {
  return new NotificationMongoPayloadCryptoService({
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  });
}

function buildSendingBroadcast(): NotificationBroadcastDocument {
  const now = new Date('2026-07-27T10:00:00.000Z');
  return {
    _id: 'broadcast-1',
    tenantId: 'tenant-1',
    name: 'Statistics race',
    templateVersionId: 'version-1',
    channel: NotificationChannel.Bot,
    provider: NotificationDeliveryProvider.TelegramBot,
    priority: 0,
    status: NotificationBroadcastStatus.Sending,
    scheduledAt: null,
    globalVariables: {},
    snapshotCount: 0,
    queuedCount: 0,
    sentCount: 0,
    rejectedCount: 0,
    errorCount: 0,
    pendingCount: 0,
    cancelledCount: 0,
    materializedAt: now,
    materializationClaimToken: null,
    materializationClaimExpiresAt: null,
    createdBy: 'operator',
    approvedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}
