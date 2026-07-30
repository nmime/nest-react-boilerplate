// @requirements REQ-NOTIFY-PERSISTENCE-005
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
      notifications.claimPendingDeliveries({ targetType: NotificationTargetType.TelegramChat, count: 1, now }),
      notifications.claimPendingDeliveries({ targetType: NotificationTargetType.TelegramChat, count: 1, now }),
      notifications.claimPendingDeliveries({ targetType: NotificationTargetType.TelegramChat, count: 1, now }),
    ]);

    const ownedClaims = claims.filter((claim) => claim !== null);
    expect(ownedClaims).toHaveLength(1);
    expect(ownedClaims[0]?.deliveries).toHaveLength(1);
    expect(ownedClaims[0]?.deliveries[0]?.claimToken).toBe(ownedClaims[0]?.claimToken);
  });

  it('uses one opaque token for every delivery in a claimed batch', async () => {
    const { notifications } = repositories();
    await createPendingNotification(notifications, '123');
    await createPendingNotification(notifications, '456');

    const claim = await notifications.claimPendingDeliveries({
      targetType: NotificationTargetType.TelegramChat,
      count: 2,
      now: new Date(Date.now() + 1_000),
    });

    expect(claim?.deliveries).toHaveLength(2);
    expect(new Set(claim?.deliveries.map((delivery) => delivery.claimToken))).toEqual(new Set([claim?.claimToken]));
  });

  it('renews only rows owned by the current claim token', async () => {
    const { database, notifications } = repositories();
    await createPendingNotification(notifications);
    const claimedAt = new Date(Date.now() + 1_000);
    const { claim, delivery } = await claimOne(notifications, claimedAt);
    const renewedAt = new Date(claimedAt.getTime() + 10_000);

    await expect(notifications.renewDeliveryClaim(claim.claimToken, renewedAt)).resolves.toBe(true);
    await expect(notifications.renewDeliveryClaim(randomUUID(), renewedAt)).resolves.toBe(false);
    await expect(
      database
        .collection<NotificationDeliveryDocument>(NotificationMongoCollections.deliveries)
        .findOne({ _id: delivery.delivery.id }),
    ).resolves.toMatchObject({
      claimToken: claim.claimToken,
      claimExpiresAt: new Date(renewedAt.getTime() + MongoNotificationClaimLeaseMs),
    });
  });

  it('reclaims an expired lease and rejects completion from the stale token', async () => {
    const { database, notifications } = repositories();
    await createPendingNotification(notifications);
    const createdAt = new Date(Date.now() + 1_000);
    const first = await claimOne(notifications, createdAt);
    const second = await claimOne(notifications, new Date(createdAt.getTime() + MongoNotificationClaimLeaseMs + 1));
    expect(second.claim.claimToken).not.toBe(first.claim.claimToken);
    await expect(notifications.renewDeliveryClaim(first.claim.claimToken, new Date())).resolves.toBe(false);

    await notifications.saveClaimedDeliveryResults(
      [
        {
          id: first.delivery.delivery.id,
          createdAt: first.delivery.delivery.createdAt,
          claimToken: first.claim.claimToken,
          status: NotificationStatus.Sent,
        },
      ],
      first.claim.claimToken,
    );
    expect(
      await database
        .collection<NotificationDeliveryDocument>(NotificationMongoCollections.deliveries)
        .findOne({ _id: first.delivery.delivery.id }),
    ).toMatchObject({ status: NotificationStatus.Pending, claimToken: second.claim.claimToken });

    await expect(
      notifications.beginClaimedDeliveryAttempts(
        [{ id: second.delivery.delivery.id, createdAt: second.delivery.delivery.createdAt }],
        second.claim.claimToken,
        new Date(),
      ),
    ).resolves.toHaveLength(1);
    await notifications.saveClaimedDeliveryResults(
      [
        {
          id: second.delivery.delivery.id,
          createdAt: second.delivery.delivery.createdAt,
          claimToken: second.claim.claimToken,
          status: NotificationStatus.Sent,
        },
      ],
      second.claim.claimToken,
    );
    expect(
      await database
        .collection<NotificationDeliveryDocument>(NotificationMongoCollections.deliveries)
        .findOne({ _id: second.delivery.delivery.id }),
    ).toMatchObject({ attempts: 1, status: NotificationStatus.Sent, dispatchStartedAt: null, claimToken: null });
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
    const firstClaim = await claimOne(notifications, new Date(now.getTime() + 1_000));

    await broadcasts.transitionBroadcast({
      broadcastId,
      tenantId,
      action: 'pause',
      idempotencyKey: randomUUID(),
      actorId,
    });
    await notifications.saveClaimedDeliveryResults(
      [
        {
          id: firstClaim.delivery.delivery.id,
          createdAt: firstClaim.delivery.delivery.createdAt,
          claimToken: firstClaim.claim.claimToken,
          status: NotificationStatus.Sent,
        },
      ],
      firstClaim.claim.claimToken,
    );
    await expect(deliveries.findOne({ _id: firstClaim.delivery.delivery.id })).resolves.toMatchObject({
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
    await notifications.saveClaimedDeliveryResults(
      [
        {
          id: firstClaim.delivery.delivery.id,
          createdAt: firstClaim.delivery.delivery.createdAt,
          claimToken: firstClaim.claim.claimToken,
          status: NotificationStatus.Sent,
        },
      ],
      firstClaim.claim.claimToken,
    );
    await expect(deliveries.findOne({ _id: firstClaim.delivery.delivery.id })).resolves.toMatchObject({
      status: NotificationStatus.Pending,
      attempts: 0,
      claimToken: null,
      claimExpiresAt: null,
    });

    const secondClaim = await claimOne(notifications, new Date(now.getTime() + 2_000));
    expect(secondClaim.claim.claimToken).not.toBe(firstClaim.claim.claimToken);
    await broadcasts.transitionBroadcast({
      broadcastId,
      tenantId,
      action: 'cancel',
      idempotencyKey: randomUUID(),
      actorId,
    });
    await notifications.saveClaimedDeliveryResults(
      [
        {
          id: secondClaim.delivery.delivery.id,
          createdAt: secondClaim.delivery.delivery.createdAt,
          claimToken: secondClaim.claim.claimToken,
          status: NotificationStatus.Sent,
        },
      ],
      secondClaim.claim.claimToken,
    );
    await expect(deliveries.findOne({ _id: secondClaim.delivery.delivery.id })).resolves.toMatchObject({
      status: NotificationStatus.Cancelled,
      attempts: 0,
      claimToken: null,
      claimExpiresAt: null,
    });
  });

  it('records a pre-dispatch failure only when its embedded and claim-level tokens agree', async () => {
    const { database, notifications } = repositories();
    await createPendingNotification(notifications);
    const { claim, delivery } = await claimOne(notifications, new Date(Date.now() + 1_000));
    const deliveries = database.collection<NotificationDeliveryDocument>(NotificationMongoCollections.deliveries);

    await notifications.saveClaimedDeliveryResults(
      [
        {
          id: delivery.delivery.id,
          createdAt: delivery.delivery.createdAt,
          claimToken: randomUUID(),
          status: NotificationStatus.Pending,
        },
      ],
      claim.claimToken,
    );
    await expect(deliveries.findOne({ _id: delivery.delivery.id })).resolves.toMatchObject({
      attempts: 0,
      claimToken: claim.claimToken,
    });

    await notifications.saveClaimedDeliveryResults(
      [
        {
          id: delivery.delivery.id,
          createdAt: delivery.delivery.createdAt,
          claimToken: claim.claimToken,
          status: NotificationStatus.Pending,
        },
      ],
      claim.claimToken,
    );
    const persisted = await deliveries.findOne({ _id: delivery.delivery.id });
    expect(persisted).toMatchObject({
      attempts: 1,
      status: NotificationStatus.Pending,
      dispatchStartedAt: null,
      claimToken: null,
      claimExpiresAt: null,
    });
    expect(persisted?.sendAfter).toBeInstanceOf(Date);
  });

  it('quarantines a delivery when dispatch starts without a durable provider result', async () => {
    const { database, notifications } = repositories();
    await createPendingNotification(notifications);
    const claimedAt = new Date(Date.now() + 1_000);
    const { claim, delivery } = await claimOne(notifications, claimedAt);
    const dispatchStartedAt = new Date(claimedAt.getTime() + 1_000);
    const identity = { id: delivery.delivery.id, createdAt: delivery.delivery.createdAt };

    await expect(
      notifications.beginClaimedDeliveryAttempts([identity], claim.claimToken, dispatchStartedAt),
    ).resolves.toEqual([identity]);
    await expect(
      notifications.claimPendingDeliveries({
        targetType: NotificationTargetType.TelegramChat,
        count: 1,
        now: new Date(dispatchStartedAt.getTime() + MongoNotificationClaimLeaseMs + 1),
      }),
    ).resolves.toBeNull();
    await expect(
      notifications.countRecentDeliveryErrors({ fromDate: new Date(claimedAt.getTime() - 1), limit: 10 }),
    ).resolves.toBe(1);
    await expect(
      database
        .collection<NotificationDeliveryDocument>(NotificationMongoCollections.deliveries)
        .findOne({ _id: delivery.delivery.id }),
    ).resolves.toMatchObject({
      attempts: 1,
      status: NotificationStatus.Pending,
      dispatchStartedAt,
      claimToken: claim.claimToken,
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

async function claimOne(persistence: MongoNotificationPersistence, now: Date) {
  const claim = await persistence.claimPendingDeliveries({
    targetType: NotificationTargetType.TelegramChat,
    count: 1,
    now,
  });
  if (!claim) {
    throw new Error('Expected a delivery claim.');
  }
  const delivery = claim.deliveries[0];
  if (!delivery) {
    throw new Error('Expected the claim to contain a delivery.');
  }
  return { claim, delivery };
}

async function createPendingNotification(persistence: MongoNotificationPersistence, targetId = '123'): Promise<void> {
  await persistence.upsertTemplate({
    code: 'delivery',
    channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Hello' } } }],
  });
  await persistence.create({
    targetType: NotificationTargetType.TelegramChat,
    targetId,
    templateCode: 'delivery',
    inAppVisible: false,
  });
}
