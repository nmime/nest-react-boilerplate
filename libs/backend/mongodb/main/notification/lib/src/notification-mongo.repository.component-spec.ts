import { randomUUID } from 'node:crypto';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import {
  NotificationBroadcastStatus,
  NotificationChannel,
  NotificationDeliveryProvider,
  NotificationSegmentKind,
  NotificationStatus,
  NotificationTargetType,
} from '@app/common-notifications';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeMongoNotificationPersistence } from './notification-mongo.collections';
import {
  NotificationMongoCollections,
  type NotificationBroadcastDocument,
  type NotificationDeliveryDocument,
} from './notification-mongo.documents';
import { MongoNotificationBroadcastPersistence } from './mongo-notification-broadcast.persistence';
import { MongoNotificationClaimLeaseMs, MongoNotificationPersistence } from './mongo-notification.persistence';
import { NotificationMongoPayloadCryptoService } from './notification-payload-crypto.service';

describe('Mongo notification persistence on a replica set', () => {
  let container: StartedMongoDBContainer;
  let client: MongoClient;

  beforeAll(async () => {
    container = await new MongoDBContainer('mongo:7.0.26-jammy').start();
    const separator = container.getConnectionString().includes('?') ? '&' : '?';
    client = new MongoClient(`${container.getConnectionString()}${separator}directConnection=true&replicaSet=rs0`);
    await client.connect();
  });

  beforeEach(async () => {
    const database = client.db('notification_component');
    await database.dropDatabase();
    await initializeMongoNotificationPersistence(database);
  });

  afterAll(async () => {
    await client.close();
    await container.stop();
  });

  const repositories = () => {
    const database = client.db('notification_component');
    const crypto = new NotificationMongoPayloadCryptoService({
      NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    });
    return {
      database,
      notifications: new MongoNotificationPersistence(database, client, crypto),
      broadcasts: new MongoNotificationBroadcastPersistence(database, client, crypto),
    };
  };

  it('rolls back every notification and delivery when a batch item fails', async () => {
    const { database, notifications } = repositories();
    await notifications.upsertTemplate({
      code: 'known',
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Hello' } } }],
    });

    await expect(
      notifications.createBatch({
        targetType: NotificationTargetType.TelegramChat,
        inAppVisible: false,
        items: [
          { targetId: '1', templateCode: 'known' },
          { targetId: '2', templateCode: 'missing' },
        ],
      }),
    ).rejects.toThrow();

    await expect(
      Promise.all([
        database.collection(NotificationMongoCollections.notifications).countDocuments(),
        database.collection(NotificationMongoCollections.deliveries).countDocuments(),
      ]),
    ).resolves.toEqual([0, 0]);
  });

  it('allows only one concurrent worker to claim a delivery', async () => {
    const { notifications } = repositories();
    await createPendingNotification(notifications);
    const now = new Date(Date.now() + 1_000);

    const claims = await Promise.all([
      notifications.findPendingDeliveries({ targetType: NotificationTargetType.TelegramChat, count: 1, now }),
      notifications.findPendingDeliveries({ targetType: NotificationTargetType.TelegramChat, count: 1, now }),
      notifications.findPendingDeliveries({ targetType: NotificationTargetType.TelegramChat, count: 1, now }),
    ]);

    expect(claims.flat()).toHaveLength(1);
    expect(new Set(claims.flat().map((claim) => claim.claimToken)).size).toBe(1);
  });

  it('reclaims an expired lease and rejects completion from the stale token', async () => {
    const { database, notifications } = repositories();
    await createPendingNotification(notifications);
    const createdAt = new Date(Date.now() + 1_000);
    const first = (
      await notifications.findPendingDeliveries({
        targetType: NotificationTargetType.TelegramChat,
        count: 1,
        now: createdAt,
      })
    )[0];
    expect(first).toBeDefined();
    if (!first) {
      throw new Error('Expected the initial delivery claim.');
    }
    const second = (
      await notifications.findPendingDeliveries({
        targetType: NotificationTargetType.TelegramChat,
        count: 1,
        now: new Date(createdAt.getTime() + MongoNotificationClaimLeaseMs + 1),
      })
    )[0];
    expect(second?.claimToken).not.toBe(first.claimToken);
    if (!second) {
      throw new Error('Expected the stale lease to be reclaimed.');
    }

    await notifications.saveDeliveryResults([
      {
        id: first.delivery.id,
        createdAt: first.delivery.createdAt,
        claimToken: first.claimToken,
        status: NotificationStatus.Sent,
      },
    ]);
    expect(
      await database
        .collection<NotificationDeliveryDocument>(NotificationMongoCollections.deliveries)
        .findOne({ _id: first.delivery.id }),
    ).toMatchObject({ status: NotificationStatus.Pending, claimToken: second.claimToken });

    await notifications.saveDeliveryResults([
      {
        id: second.delivery.id,
        createdAt: second.delivery.createdAt,
        claimToken: second.claimToken,
        status: NotificationStatus.Sent,
      },
    ]);
    expect(
      await database
        .collection<NotificationDeliveryDocument>(NotificationMongoCollections.deliveries)
        .findOne({ _id: second.delivery.id }),
    ).toMatchObject({ status: NotificationStatus.Sent, claimToken: null });
  });

  it('fences an in-flight delivery result across pause, resume, and cancel', async () => {
    const { broadcasts, database, notifications } = repositories();
    await createPendingNotification(notifications);
    const broadcastId = randomUUID();
    const tenantId = randomUUID();
    const actorId = randomUUID();
    const now = new Date();
    await database.collection<NotificationBroadcastDocument>(NotificationMongoCollections.broadcasts).insertOne({
      _id: broadcastId,
      tenantId,
      name: 'Race fence',
      templateVersionId: randomUUID(),
      channel: NotificationChannel.Bot,
      provider: NotificationDeliveryProvider.TelegramBot,
      priority: 0,
      status: NotificationBroadcastStatus.Sending,
      scheduledAt: null,
      globalVariables: {},
      snapshotCount: 0,
      queuedCount: 1,
      sentCount: 0,
      rejectedCount: 0,
      errorCount: 0,
      pendingCount: 1,
      cancelledCount: 0,
      materializedAt: now,
      materializationClaimToken: null,
      materializationClaimExpiresAt: null,
      createdBy: actorId,
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    });
    const deliveries = database.collection<NotificationDeliveryDocument>(NotificationMongoCollections.deliveries);
    await deliveries.updateOne({}, { $set: { broadcastId } });
    const firstClaim = (
      await notifications.findPendingDeliveries({
        targetType: NotificationTargetType.TelegramChat,
        count: 1,
        now: new Date(now.getTime() + 1_000),
      })
    )[0];
    if (!firstClaim) {
      throw new Error('Expected the broadcast delivery to be claimed.');
    }

    await broadcasts.transitionBroadcast({
      broadcastId,
      tenantId,
      action: 'pause',
      idempotencyKey: randomUUID(),
      actorId,
    });
    await notifications.saveDeliveryResults([
      {
        id: firstClaim.delivery.id,
        createdAt: firstClaim.delivery.createdAt,
        claimToken: firstClaim.claimToken,
        status: NotificationStatus.Sent,
      },
    ]);
    await expect(deliveries.findOne({ _id: firstClaim.delivery.id })).resolves.toMatchObject({
      status: NotificationStatus.Paused,
      attempts: 0,
      claimToken: null,
      claimExpiresAt: null,
    });

    await broadcasts.transitionBroadcast({
      broadcastId,
      tenantId,
      action: 'resume',
      idempotencyKey: randomUUID(),
      actorId,
    });
    await notifications.saveDeliveryResults([
      {
        id: firstClaim.delivery.id,
        createdAt: firstClaim.delivery.createdAt,
        claimToken: firstClaim.claimToken,
        status: NotificationStatus.Sent,
      },
    ]);
    await expect(deliveries.findOne({ _id: firstClaim.delivery.id })).resolves.toMatchObject({
      status: NotificationStatus.Pending,
      attempts: 0,
      claimToken: null,
      claimExpiresAt: null,
    });

    const secondClaim = (
      await notifications.findPendingDeliveries({
        targetType: NotificationTargetType.TelegramChat,
        count: 1,
        now: new Date(now.getTime() + 2_000),
      })
    )[0];
    if (!secondClaim) {
      throw new Error('Expected the resumed delivery to receive a new claim.');
    }
    expect(secondClaim.claimToken).not.toBe(firstClaim.claimToken);
    await broadcasts.transitionBroadcast({
      broadcastId,
      tenantId,
      action: 'cancel',
      idempotencyKey: randomUUID(),
      actorId,
    });
    await notifications.saveDeliveryResults([
      {
        id: secondClaim.delivery.id,
        createdAt: secondClaim.delivery.createdAt,
        claimToken: secondClaim.claimToken,
        status: NotificationStatus.Sent,
      },
    ]);
    await expect(deliveries.findOne({ _id: secondClaim.delivery.id })).resolves.toMatchObject({
      status: NotificationStatus.Cancelled,
      attempts: 0,
      claimToken: null,
      claimExpiresAt: null,
    });
  });

  it('applies an idempotent broadcast transition and snapshot creation atomically', async () => {
    const { broadcasts, database } = repositories();
    const tenantId = randomUUID();
    const actorId = randomUUID();
    const template = await broadcasts.createAdminTemplate({
      tenantId,
      actorId,
      code: `broadcast-${randomUUID()}`,
      name: 'Broadcast',
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Hello' } } }],
    });
    const published = await broadcasts.publishAdminTemplate(template.id, tenantId, actorId);
    if (!published?.currentVersionId) {
      throw new Error('Expected a published template version.');
    }
    const segment = await broadcasts.createSegment({
      tenantId,
      actorId,
      name: 'Recipients',
      kind: NotificationSegmentKind.Static,
    });
    const broadcast = await broadcasts.createBroadcast({
      tenantId,
      actorId,
      name: 'Notice',
      templateVersionId: published.currentVersionId,
      channel: NotificationChannel.Bot,
      provider: NotificationDeliveryProvider.TelegramBot,
      segmentIds: [segment.id],
    });
    const command = {
      broadcastId: broadcast.id,
      tenantId,
      action: 'collect-audience',
      idempotencyKey: randomUUID(),
      actorId,
    };

    const results = await Promise.all([
      broadcasts.transitionBroadcast(command),
      broadcasts.transitionBroadcast(command),
      broadcasts.transitionBroadcast(command),
    ]);
    expect(results.every((result) => result?.status === NotificationBroadcastStatus.Collecting)).toBe(true);
    await expect(
      Promise.all([
        database
          .collection(NotificationMongoCollections.broadcastCommands)
          .countDocuments({ broadcastId: broadcast.id }),
        database.collection(NotificationMongoCollections.snapshots).countDocuments({ broadcastId: broadcast.id }),
      ]),
    ).resolves.toEqual([1, 1]);
  });
});

async function createPendingNotification(persistence: MongoNotificationPersistence): Promise<void> {
  await persistence.upsertTemplate({
    code: 'delivery',
    channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Hello' } } }],
  });
  await persistence.create({
    targetType: NotificationTargetType.TelegramChat,
    targetId: '123',
    templateCode: 'delivery',
    inAppVisible: false,
  });
}
