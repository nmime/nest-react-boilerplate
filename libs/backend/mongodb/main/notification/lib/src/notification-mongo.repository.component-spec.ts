// @requirements REQ-NOTIFY-TEMPLATE-003 REQ-NOTIFY-AUDIENCE-004 REQ-NOTIFY-PERSISTENCE-005 REQ-NOTIFY-LIFECYCLE-002
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { S3Service } from '@app/backend-common-s3';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Component-only atomicity test composes the real admin audit service with this provider.
import { AuditLogAdminPersistenceError, AuditLogAdminService } from '@app/backend-feature-audit-log-admin';
// eslint-disable-next-line @nx/enforce-module-boundaries -- Component-only atomicity test drives real admin mutations; production persistence stays independent.
import {
  NotificationAdminService,
  NotificationConfigService,
  type NotificationSegmentResolverRegistry,
} from '@app/backend-feature-notification-main';
// nx-ignore-next-line -- The component fixture exercises the concrete selected audit provider.
import {
  MongoAdminAuditLogRepository,
  AuthMongoCollections,
  initializeMongoAuthPersistence,
} from '@app/backend-mongodb-main-auth';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
// nx-ignore-next-line -- This component-only probe is not a production build dependency.
import { hasDockerRuntime } from '@app/backend-common-component-test-runtime';
import {
  NotificationAudienceSnapshotStatus,
  NotificationBroadcastStatus,
  NotificationChannel,
  NotificationDeliveryProvider,
  NotificationSegmentKind,
  NotificationStatus,
  NotificationTargetType,
} from '@app/common-notifications';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTenantOwnedMongoNotificationPersistence } from './notification-mongo.tenant-collections';
import {
  NotificationMongoCollections,
  type NotificationBroadcastDocument,
  type NotificationDeliveryDocument,
} from './notification-mongo.documents';
import { MongoNotificationBroadcastPersistence } from './mongo-notification-broadcast.persistence';
import { MongoNotificationClaimLeaseMs, MongoNotificationPersistence } from './mongo-notification.persistence';
import { NotificationMongoPayloadCryptoService } from './notification-payload-crypto.service';

const dockerAvailable = hasDockerRuntime();
if (!dockerAvailable) {
  process.stderr.write('Mongo notification component test: skipped because Docker is not available on this host.\n');
}
const describeIfDocker = dockerAvailable ? describe : describe.skip;

describeIfDocker('Mongo notification persistence on a replica set', () => {
  let container: StartedMongoDBContainer;
  let client: MongoClient;

  beforeAll(async () => {
    container = await new MongoDBContainer('mongo:8.0.32-noble@sha256:0393ab544cbbe92b2dd64719205ecb14a8b3824b17ea75051e2f22482c3e4e66').start();
    const separator = container.getConnectionString().includes('?') ? '&' : '?';
    client = new MongoClient(`${container.getConnectionString()}${separator}directConnection=true&replicaSet=rs0`);
    await client.connect();
  });

  beforeEach(async () => {
    const database = client.db('notification_component');
    await database.dropDatabase();
    await initializeTenantOwnedMongoNotificationPersistence(database);
    await initializeMongoAuthPersistence(database);
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

  it.each([AuthMongoCollections.auditLogs, AuthMongoCollections.outbox])(
    'rolls back all admin notification writes when %s rejects the audit transaction',
    async (failedCollection) => {
      const { database, broadcasts, notifications } = repositories();
      const audit = new AuditLogAdminService(new MongoAdminAuditLogRepository(database, client));
      const uploadedObjects: string[] = [];
      const segmentResolvers = {} as unknown as NotificationSegmentResolverRegistry; // Static audiences never call dynamic resolvers.
      const admin = new NotificationAdminService(
        new NotificationConfigService(new ConfigService()),
        broadcasts,
        notifications,
        {
          putObject: ({ key }: { key: string }) => {
            uploadedObjects.push(key);
            return Promise.resolve();
          },
        } as unknown as S3Service,
        segmentResolvers,
      );
      const tenantId = randomUUID();
      const actorId = randomUUID();
      const operation = async (transaction: unknown) => {
        let template = await admin.createTemplate(
          {
            tenantId,
            actorId,
            code: `atomic-${randomUUID()}`,
            name: 'Atomic template',
            channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Version one' } } }],
          },
          transaction,
        );
        expect(template.versions).toHaveLength(1);
        await admin.publishTemplate(template.id, tenantId, actorId, transaction);
        await admin.updateTemplate(template.id, tenantId, { actorId, name: 'Updated template' }, transaction);
        const published = await admin.publishTemplate(template.id, tenantId, actorId, transaction);
        if (!published?.currentVersionId) {
          throw new Error('Owned template was not published.');
        }
        template = published;
        expect(template.versions).toHaveLength(2);
        await admin.testSend(
          {
            id: template.id,
            tenantId,
            targetType: NotificationTargetType.TelegramChat,
            targetId: 'owned-fixture',
            channel: NotificationChannel.Bot,
            provider: NotificationDeliveryProvider.TelegramBot,
            variables: {},
          },
          transaction,
        );
        const segment = await admin.createSegment(
          { tenantId, actorId, name: 'Atomic audience', kind: NotificationSegmentKind.Static },
          transaction,
        );
        await admin.updateSegment(segment.id, tenantId, { actorId, name: 'Updated audience' }, transaction);
        await admin.uploadSegmentCsv(
          {
            id: segment.id,
            tenantId,
            actorId,
            filename: 'fixture.csv',
            contentBase64: Buffer.from('targetId\nfixture\n').toString('base64'),
          },
          transaction,
        );
        const broadcast = await admin.createBroadcast(
          {
            tenantId,
            actorId,
            name: 'Atomic broadcast',
            templateVersionId: published.currentVersionId,
            channel: NotificationChannel.Bot,
            provider: NotificationDeliveryProvider.TelegramBot,
            segmentIds: [segment.id],
          },
          transaction,
        );
        expect(broadcast.segmentIds).toEqual([segment.id]);
        await admin.updateBroadcast(broadcast.id, tenantId, { name: 'Updated broadcast' }, transaction);
        const collecting = await admin.command(
          {
            broadcastId: broadcast.id,
            tenantId,
            actorId,
            action: 'collect-audience',
            idempotencyKey: 'owned-atomic-command',
          },
          transaction,
        );
        expect(collecting?.snapshot).toMatchObject({ status: NotificationAudienceSnapshotStatus.Created });
        await admin.archiveTemplate(template.id, tenantId, actorId, transaction);
        await admin.archiveSegment(segment.id, tenantId, actorId, transaction);
        return broadcast;
      };
      const mutate = () =>
        audit.recordMutation(
          {
            tenantId,
            actorUserId: actorId,
            action: 'admin.notification_broadcast.create',
            resource: 'admin.notification-broadcasts',
            targetId: (result) => result.id,
            after: (result) => ({ id: result.id }),
          },
          operation,
        );
      const collectionInfo = await database.listCollections({ name: failedCollection }, { nameOnly: false }).next();
      if (!collectionInfo || !('options' in collectionInfo) || !collectionInfo.options) {
        throw new Error('Owned audit fixture collection metadata is unavailable.');
      }
      const original: unknown = collectionInfo.options.validator ?? {};
      await database.command({
        collMod: failedCollection,
        validator: { $expr: { $eq: [1, 0] } },
        validationAction: 'error',
      });
      try {
        await expect(mutate()).rejects.toBeInstanceOf(AuditLogAdminPersistenceError);
        for (const collectionName of [
          ...Object.values(NotificationMongoCollections),
          AuthMongoCollections.auditLogs,
          AuthMongoCollections.outbox,
        ]) {
          // eslint-disable-next-line no-await-in-loop
          expect(await database.collection(collectionName).countDocuments(), collectionName).toBe(0);
        }
        expect(uploadedObjects).toHaveLength(1); // Object storage has a separate cleanup boundary.
      } finally {
        await database.command({ collMod: failedCollection, validator: original, validationAction: 'error' });
      }
      const committed = await mutate();
      expect(await broadcasts.getBroadcast(committed.id, tenantId)).toMatchObject({ name: 'Updated broadcast' });
      expect(await database.collection(AuthMongoCollections.auditLogs).countDocuments()).toBe(1);
      expect(await database.collection(AuthMongoCollections.outbox).countDocuments()).toBe(1);
      expect(await database.collection(NotificationMongoCollections.deliveries).countDocuments()).toBe(1);
    },
  );

  it('rejects invalid and inactive external transaction tokens before notification writes', async () => {
    const { broadcasts, notifications, database } = repositories();
    const input = {
      tenantId: randomUUID(),
      actorId: randomUUID(),
      name: 'Invalid',
      kind: NotificationSegmentKind.Static,
    };
    await expect(broadcasts.createSegment(input, {})).rejects.toThrow('notification_invalid_transaction');
    const inactiveSession = client.startSession();
    try {
      await expect(broadcasts.createSegment(input, inactiveSession)).rejects.toThrow(
        'notification_invalid_transaction',
      );
      expect(() =>
        notifications.create(
          {
            tenantId: input.tenantId,
            targetType: NotificationTargetType.TelegramChat,
            targetId: 'fixture',
            templateCode: 'fixture',
          },
          inactiveSession,
        ),
      ).toThrow('notification_invalid_transaction');
      expect(await database.collection(NotificationMongoCollections.segments).countDocuments()).toBe(0);
    } finally {
      await inactiveSession.endSession();
    }
  });

  it('allows the same template code in separate tenants without cross-tenant mutation', async () => {
    const { database, notifications } = repositories();
    const tenantA = randomUUID();
    const tenantB = randomUUID();

    await notifications.upsertTemplate({
      tenantId: tenantA,
      code: 'welcome',
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Tenant A' } } }],
    });
    await notifications.upsertTemplate({
      tenantId: tenantB,
      code: 'welcome',
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Tenant B' } } }],
    });

    const templates = await database
      .collection(NotificationMongoCollections.templates)
      .find({ code: 'welcome' })
      .sort({ tenantId: 1 })
      .toArray();
    expect(templates.map((template) => String(template['tenantId']))).toEqual(
      [tenantA, tenantB].sort((left, right) => left.localeCompare(right)),
    );
    expect(new Set(templates.map((template) => String(template['currentVersionId']))).size).toBe(2);
  });

  it('uses a tenant template in preference to the shared fallback and never another tenant template', async () => {
    const { database, notifications } = repositories();
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    await notifications.upsertTemplate({
      code: 'welcome',
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Shared' } } }],
    });
    await notifications.upsertTemplate({
      tenantId: tenantA,
      code: 'welcome',
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Tenant A' } } }],
    });

    const tenantANotification = await notifications.create({
      tenantId: tenantA,
      targetType: NotificationTargetType.TelegramChat,
      targetId: 'tenant-a-chat',
      templateCode: 'welcome',
      channels: [NotificationChannel.Bot],
      inAppVisible: false,
    });
    const tenantBNotification = await notifications.create({
      tenantId: tenantB,
      targetType: NotificationTargetType.TelegramChat,
      targetId: 'tenant-b-chat',
      templateCode: 'welcome',
      channels: [NotificationChannel.Bot],
      inAppVisible: false,
    });
    const persisted = await database
      .collection(NotificationMongoCollections.notifications)
      .find({ _id: { $in: [tenantANotification.id as never, tenantBNotification.id as never] } })
      .toArray();
    const byTenant = new Map(persisted.map((notification) => [notification['tenantId'], notification]));
    const templates = await database
      .collection(NotificationMongoCollections.templates)
      .find({ code: 'welcome' })
      .toArray();
    const tenantTemplate = templates.find((template) => template['tenantId'] === tenantA);
    const sharedTemplate = templates.find((template) => template['tenantId'] === null);
    expect(byTenant.get(tenantA)?.['templateId']).toBe(tenantTemplate?.['_id']);
    expect(byTenant.get(tenantB)?.['templateId']).toBe(sharedTemplate?.['_id']);
  });

  it('uses a usable shared template when the tenant override is not publishable', async () => {
    const { database, notifications } = repositories();
    const tenantId = randomUUID();
    await notifications.upsertTemplate({
      code: 'welcome',
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Shared' } } }],
    });
    const unpublishedTenantTemplateId = randomUUID();
    await database
      .collection<{ _id: string } & Record<string, unknown>>(NotificationMongoCollections.templates)
      .insertOne({
        _id: unpublishedTenantTemplateId,
        tenantId,
        code: 'welcome',
        name: 'welcome',
        description: null,
        source: 'code',
        status: 'draft',
        currentVersionId: null,
        createdBy: null,
        updatedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const record = await notifications.create({
      tenantId,
      targetType: NotificationTargetType.TelegramChat,
      targetId: 'tenant-chat',
      templateCode: 'welcome',
      channels: [NotificationChannel.Bot],
      inAppVisible: false,
    });

    expect(record.template.id).not.toBe(unpublishedTenantTemplateId);
    expect(record.template.channels[NotificationChannel.Bot]?.content).toEqual({ body: { en: 'Shared' } });
  });

  it('uses a shared template when the tenant version lacks a requested channel', async () => {
    const { notifications } = repositories();
    const tenantId = randomUUID();
    await notifications.upsertTemplate({
      code: 'welcome',
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Shared' } } }],
    });
    await notifications.upsertTemplate({
      tenantId,
      code: 'welcome',
      channels: [
        {
          channel: NotificationChannel.Email,
          content: { subject: { en: 'Tenant' }, body: { en: 'Tenant' } },
        },
      ],
    });

    const record = await notifications.create({
      tenantId,
      targetType: NotificationTargetType.TelegramChat,
      targetId: 'tenant-chat',
      templateCode: 'welcome',
      channels: [NotificationChannel.Bot],
      inAppVisible: false,
    });

    expect(record.template.channels[NotificationChannel.Bot]?.content).toEqual({ body: { en: 'Shared' } });
    expect(record.template.channels[NotificationChannel.Email]).toBeUndefined();
  });

  it('rejects the request when neither tenant nor shared template supports the requested channel', async () => {
    const { notifications } = repositories();
    const tenantId = randomUUID();
    const emailChannel = {
      channel: NotificationChannel.Email,
      content: { subject: { en: 'Email' }, body: { en: 'Email' } },
    } as const;
    await notifications.upsertTemplate({ code: 'welcome', channels: [emailChannel] });
    await notifications.upsertTemplate({ tenantId, code: 'welcome', channels: [emailChannel] });

    await expect(
      notifications.create({
        tenantId,
        targetType: NotificationTargetType.TelegramChat,
        targetId: 'tenant-chat',
        templateCode: 'welcome',
        channels: [NotificationChannel.Bot],
        inAppVisible: false,
      }),
    ).rejects.toThrow('welcome has no published version that supports the requested channels');
  });

  it('rolls back every notification and delivery when a batch item fails', async () => {
    const { database, notifications } = repositories();
    await notifications.upsertTemplate({
      code: 'known',
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Hello' } } }],
    });

    await expect(
      notifications.createBatch({
        tenantId: '11111111-1111-4111-8111-111111111111',
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

  it('preserves broadcast tenant ownership while materializing Mongo notifications', async () => {
    const { broadcasts, database } = repositories();
    const tenantId = randomUUID();
    const actorId = randomUUID();
    const template = await broadcasts.createAdminTemplate({
      tenantId,
      actorId,
      code: `materialize-${randomUUID()}`,
      name: 'Materialize',
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
      name: 'Tenant notice',
      templateVersionId: published.currentVersionId,
      channel: NotificationChannel.Bot,
      provider: NotificationDeliveryProvider.TelegramBot,
      segmentIds: [segment.id],
    });
    const now = new Date();
    const snapshotId = randomUUID();
    await database.collection(NotificationMongoCollections.snapshots).insertOne({
      // The production collection uses UUID strings; Mongo's default generic otherwise assumes ObjectId.
      _id: snapshotId as never,
      broadcastId: broadcast.id,
      snapshotAt: now,
      status: NotificationAudienceSnapshotStatus.Completed,
      resolvedCount: 1,
      distinctCount: 1,
      duplicateCount: 0,
      conflictCount: 0,
      invalidCount: 0,
      error: null,
      claimToken: null,
      claimExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await database.collection(NotificationMongoCollections.snapshotMembers).insertOne({
      _id: randomUUID() as never,
      snapshotId,
      targetType: NotificationTargetType.TelegramChat,
      targetId: 'tenant-chat',
      language: null,
      variables: {},
      materializedAt: null,
      createdAt: now,
    });
    await database.collection<NotificationBroadcastDocument>(NotificationMongoCollections.broadcasts).updateOne(
      { _id: broadcast.id },
      {
        $set: {
          status: NotificationBroadcastStatus.Sending,
          materializedAt: null,
          materializationClaimToken: null,
          materializationClaimExpiresAt: null,
        },
      },
    );

    const context = await broadcasts.claimBroadcastMaterialization(10);
    if (!context) {
      throw new Error('Expected a materialization claim.');
    }
    await expect(broadcasts.materializeBroadcastMembers(context)).resolves.toBe(1);
    await expect(
      database.collection(NotificationMongoCollections.notifications).findOne({ broadcastId: broadcast.id }),
    ).resolves.toMatchObject({ tenantId });
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
  const notification = await persistence.create({
    tenantId: '11111111-1111-4111-8111-111111111111',
    targetType: NotificationTargetType.TelegramChat,
    targetId,
    templateCode: 'delivery',
    inAppVisible: false,
  });
  expect(notification.tenantId).toBe('11111111-1111-4111-8111-111111111111');
}
