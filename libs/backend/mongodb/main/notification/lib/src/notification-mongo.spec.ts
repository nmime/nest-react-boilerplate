// @requirements REQ-NOTIFY-PERSISTENCE-005
import {
  NotificationBroadcastStatus,
  NotificationChannel,
  NotificationDeliveryProvider,
  NotificationTemplateEngine,
} from '@app/common-notifications';
import { MongoClient, type Db } from 'mongodb';
import { notificationTransactionSession } from './mongo-runtime';
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

it('accepts only an active caller-owned Mongo transaction and never ends it', async () => {
  expect(notificationTransactionSession()).toBeUndefined();
  expect(() => notificationTransactionSession({})).toThrow('notification_invalid_transaction');
  const client = new MongoClient('mongodb://127.0.0.1:27017/owned-unused-fixture');
  const session = client.startSession();
  try {
    expect(() => notificationTransactionSession(session)).toThrow('notification_invalid_transaction');
    session.startTransaction();
    expect(notificationTransactionSession(session)).toBe(session);
    expect(session.inTransaction()).toBe(true);
    expect(session.hasEnded).toBe(false);
    await session.endSession();
    expect(() => notificationTransactionSession(session)).toThrow('notification_invalid_transaction');
  } finally {
    await session.endSession();
    await client.close();
  }
});

it('passes an active caller transaction into reads and rejects invalid tokens before database calls', async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017/owned-unused-fixture');
  const session = client.startSession();
  const findOne = vi.fn(() => Promise.resolve(null));
  const database = { collection: () => ({ findOne }) } as unknown as Db;
  const persistence = new MongoNotificationBroadcastPersistence(database, client, notificationPayloadCrypto());
  try {
    await expect(persistence.getTemplate('owned-id', 'owned-tenant', {})).rejects.toThrow(
      'notification_invalid_transaction',
    );
    expect(findOne).not.toHaveBeenCalled();
    session.startTransaction();
    await expect(persistence.getTemplate('owned-id', 'owned-tenant', session)).resolves.toBeNull();
    expect(findOne).toHaveBeenCalledWith({ _id: 'owned-id', tenantId: { $in: ['owned-tenant', null] } }, { session });
    expect(session.inTransaction()).toBe(true);
  } finally {
    await session.endSession();
    await client.close();
  }
});

it('reuses the caller transaction for every template, version and channel write without committing it', async () => {
  const client = new MongoClient('mongodb://127.0.0.1:27017/owned-unused-fixture');
  const session = client.startSession();
  const startSession = vi.spyOn(client, 'startSession');
  const calls: Array<{ operation: string; session: unknown }> = [];
  const collections = new Map<string, Record<string, unknown>>();
  const database = {
    collection: (name: string) => {
      let collection = collections.get(name);
      if (!collection) {
        const records: unknown[] = [];
        collection = {
          findOne: (_filter: unknown, options: { session?: unknown }) => {
            calls.push({ operation: 'read', session: options.session });
            return Promise.resolve(null);
          },
          insertOne: (record: unknown, options: { session?: unknown }) => {
            records.push(record);
            calls.push({ operation: 'write', session: options.session });
            return Promise.resolve({ acknowledged: true });
          },
          insertMany: (rows: unknown[], options: { session?: unknown }) => {
            records.push(...rows);
            calls.push({ operation: 'write', session: options.session });
            return Promise.resolve({ acknowledged: true });
          },
          find: (_filter: unknown, options: { session?: unknown }) => {
            calls.push({ operation: 'read', session: options.session });
            return {
              sort: () => ({ toArray: () => Promise.resolve(records) }),
              toArray: () => Promise.resolve(records),
            };
          },
        };
        collections.set(name, collection);
      }
      return collection;
    },
  } as unknown as Db;
  const persistence = new MongoNotificationBroadcastPersistence(database, client, notificationPayloadCrypto());
  try {
    session.startTransaction();
    const template = await persistence.createAdminTemplate(
      {
        tenantId: 'owned-tenant',
        actorId: 'owned-actor',
        code: 'owned-code',
        name: 'Owned template',
        channels: [
          {
            channel: NotificationChannel.Bot,
            engine: NotificationTemplateEngine.StringFormat,
            content: { body: { en: 'Owned content' } },
          },
        ],
      },
      session,
    );
    expect(template).toMatchObject({ tenantId: 'owned-tenant', code: 'owned-code', name: 'Owned template' });
    expect(template.versions).toHaveLength(1);
    expect(calls.filter((call) => call.operation === 'write')).toHaveLength(3);
    expect(calls.every((call) => call.session === session)).toBe(true);
    expect(startSession).not.toHaveBeenCalled();
    expect(session.inTransaction()).toBe(true);
    expect(session.hasEnded).toBe(false);
  } finally {
    await session.endSession();
    await client.close();
  }
});
