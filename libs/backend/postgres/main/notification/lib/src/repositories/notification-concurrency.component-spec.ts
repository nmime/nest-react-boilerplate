// @requirements REQ-NOTIFY-TEMPLATE-003 REQ-NOTIFY-AUDIENCE-004 REQ-NOTIFY-PERSISTENCE-005
import { randomUUID } from 'node:crypto';
import { MikroORM } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { type EntityManager, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from '@app/backend-common-component-test';
import { NotificationChannel, NotificationStatus, NotificationTargetType } from '@app/common-notifications';
import {
  EmptyNotificationDeliveryClaimId,
  NotificationAudienceSnapshotEntitySchema,
  NotificationAudienceSnapshotMemberEntitySchema,
  NotificationBroadcastCommandEntitySchema,
  NotificationBroadcastEntitySchema,
  NotificationBroadcastSegmentEntitySchema,
  NotificationDeliveryEntitySchema,
  NotificationEntitySchema,
  NotificationSegmentEntitySchema,
  NotificationSegmentMemberEntitySchema,
  NotificationSegmentUploadEntitySchema,
  NotificationTemplateEntitySchema,
  NotificationTemplateVersionChannelEntitySchema,
  NotificationTemplateVersionEntitySchema,
} from '../infrastructure/data-access/entities';
import { notificationMigrationOptions } from '../infrastructure/data-access/migrations';
import { NotificationPayloadCryptoService } from '../notification-payload-crypto.service';
import { PostgresNotificationBroadcastPersistence } from './postgres-notification-broadcast.persistence';
import { DeliveryClaimLeaseSeconds, PostgresNotificationPersistence } from './postgres-notification-persistence';

const dockerAvailable = hasDockerRuntime();
if (!dockerAvailable) {
  process.stderr.write(
    'Notification concurrency component test: skipped because Docker is not available on this host.\n',
  );
}
const describeIfDocker = dockerAvailable ? describe : describe.skip;

describeIfDocker('notification persistence concurrency', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM<PostgreSqlDriver>;

  beforeAll(async () => {
    container = await startPostgresContainer();
    orm = await MikroORM.init<PostgreSqlDriver>(
      createPostgresContainerMikroOrmOptions(container, notificationEntities, {
        extensions: [Migrator],
        migrations: notificationMigrationOptions,
      }),
    );
    await orm.migrator.up();
  });

  afterAll(async () => {
    await orm.close(true);
    await stopPostgresContainer(container);
  });

  it('isolates tenant templates while retaining the shared-template fallback', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const templateCode = `welcome-${randomUUID()}`;
    const notifications = deliveryPersistence(orm.em.fork());
    await notifications.upsertTemplate({
      code: templateCode,
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Shared' } } }],
    });
    await notifications.upsertTemplate({
      tenantId: tenantA,
      code: templateCode,
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Tenant A' } } }],
    });
    await notifications.upsertTemplate({
      tenantId: tenantB,
      code: templateCode,
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Tenant B' } } }],
    });

    const tenantARecord = await notifications.create({
      tenantId: tenantA,
      targetType: NotificationTargetType.TelegramChat,
      targetId: 'tenant-a-chat',
      templateCode,
      channels: [NotificationChannel.Bot],
      inAppVisible: false,
    });
    const tenantC = randomUUID();
    const tenantCRecord = await notifications.create({
      tenantId: tenantC,
      targetType: NotificationTargetType.TelegramChat,
      targetId: 'tenant-c-chat',
      templateCode,
      channels: [NotificationChannel.Bot],
      inAppVisible: false,
    });

    const templates = await rows<{ id: string; tenantId: string | null }>(
      orm.em,
      'select id, tenant_id as "tenantId" from notification_templates where code = ? order by tenant_id nulls first',
      [templateCode],
    );
    expect(templates).toHaveLength(3);
    const templateByTenant = new Map(templates.map((template) => [template.tenantId, template.id]));
    expect(tenantARecord.template.id).toBe(templateByTenant.get(tenantA));
    expect(tenantCRecord.template.id).toBe(templateByTenant.get(null));
  });

  it('uses a usable shared template when the tenant override is not publishable', async () => {
    const tenantId = randomUUID();
    const templateCode = `fallback-${randomUUID()}`;
    const notifications = deliveryPersistence(orm.em.fork());
    await notifications.upsertTemplate({
      code: templateCode,
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Shared' } } }],
    });
    await orm.em.getConnection().execute(
      `insert into notification_templates
         (id, tenant_id, code, name, description, source, status, current_version_id, created_by, updated_by)
       values (?, ?, ?, ?, null, 'code', 'draft', null, null, null)`,
      [randomUUID(), tenantId, templateCode, templateCode],
    );

    const record = await notifications.create({
      tenantId,
      targetType: NotificationTargetType.TelegramChat,
      targetId: 'tenant-chat',
      templateCode,
      channels: [NotificationChannel.Bot],
      inAppVisible: false,
    });

    expect(record.template.channels[NotificationChannel.Bot]?.content).toEqual({ body: { en: 'Shared' } });
  });

  it('uses a shared template when the tenant version lacks a requested channel', async () => {
    const tenantId = randomUUID();
    const templateCode = `channel-fallback-${randomUUID()}`;
    const notifications = deliveryPersistence(orm.em.fork());
    await notifications.upsertTemplate({
      code: templateCode,
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Shared' } } }],
    });
    await notifications.upsertTemplate({
      tenantId,
      code: templateCode,
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
      templateCode,
      channels: [NotificationChannel.Bot],
      inAppVisible: false,
    });

    expect(record.template.channels[NotificationChannel.Bot]?.content).toEqual({ body: { en: 'Shared' } });
    expect(record.template.channels[NotificationChannel.Email]).toBeUndefined();
  });

  it('rejects the request when neither tenant nor shared template supports the requested channel', async () => {
    const tenantId = randomUUID();
    const templateCode = `unusable-${randomUUID()}`;
    const notifications = deliveryPersistence(orm.em.fork());
    const emailChannel = {
      channel: NotificationChannel.Email,
      content: { subject: { en: 'Email' }, body: { en: 'Email' } },
    } as const;
    await notifications.upsertTemplate({ code: templateCode, channels: [emailChannel] });
    await notifications.upsertTemplate({ tenantId, code: templateCode, channels: [emailChannel] });

    await expect(
      notifications.create({
        tenantId,
        targetType: NotificationTargetType.TelegramChat,
        targetId: 'tenant-chat',
        templateCode,
        channels: [NotificationChannel.Bot],
        inAppVisible: false,
      }),
    ).rejects.toThrow(`${templateCode} has no published version that supports the requested channels`);
  });

  it('materializes, activates, claims, and records one delivery under concurrent workers', async () => {
    const ids = await seedBroadcast(orm.em);
    const broadcastA = broadcastPersistence(orm.em.fork());
    const broadcastB = broadcastPersistence(orm.em.fork());

    const materialized = await Promise.all([
      broadcastA.materializeNextBroadcastChunk(10),
      broadcastB.materializeNextBroadcastChunk(10),
    ]);
    expect(materialized.reduce((total, count) => total + count, 0)).toBe(1);

    const counts = await rows<{ notifications: number; deliveries: number }>(
      orm.em,
      `select
         (select count(*)::int from notifications where broadcast_id = ?) as notifications,
         (select count(*)::int from notification_deliveries where broadcast_id = ?) as deliveries`,
      [ids.broadcastId, ids.broadcastId],
    );
    expect(counts).toEqual([{ notifications: 1, deliveries: 1 }]);
    await expect(broadcastA.materializeNextBroadcastChunk(10)).resolves.toBe(0);

    const scheduledAt = new Date(Date.now() - 1_000);
    await orm.em
      .getConnection()
      .execute('update notification_broadcasts set status = ?, scheduled_at = ? where id = ?', [
        'scheduled',
        scheduledAt,
        ids.broadcastId,
      ]);
    const activated = await Promise.all([
      broadcastA.activateDueBroadcasts(new Date()),
      broadcastB.activateDueBroadcasts(new Date()),
    ]);
    expect(activated.reduce((total, count) => total + count, 0)).toBe(1);

    const deliveryA = deliveryPersistence(orm.em.fork());
    const deliveryB = deliveryPersistence(orm.em.fork());
    const claimedAt = new Date();
    const claims = await Promise.all([
      deliveryA.claimPendingDeliveries({ targetType: NotificationTargetType.Email, count: 10, now: claimedAt }),
      deliveryB.claimPendingDeliveries({ targetType: NotificationTargetType.Email, count: 10, now: claimedAt }),
    ]);
    const ownedClaims = claims.filter((claim) => claim !== null);
    expect(ownedClaims).toHaveLength(1);
    const ownedClaim = ownedClaims[0];
    if (!ownedClaim) {
      throw new Error('One worker should own the delivery claim.');
    }
    const delivery = ownedClaim.deliveries[0];
    expect(delivery).toBeDefined();
    if (!delivery) {
      throw new Error('A delivery should have been claimed.');
    }

    const result = {
      id: delivery.delivery.id,
      createdAt: delivery.delivery.createdAt,
      claimToken: ownedClaim.claimToken,
      status: NotificationStatus.Sent,
    };
    await deliveryA.beginClaimedDeliveryAttempts(
      [{ id: result.id, createdAt: result.createdAt }],
      ownedClaim.claimToken,
      new Date(),
    );
    await deliveryA.saveClaimedDeliveryResults([result], ownedClaim.claimToken);

    const persisted = await rows<{ attempts: number; status: string }>(
      orm.em,
      'select attempts, status from notification_deliveries where notification_id = ?',
      [delivery.notification.id],
    );
    expect(persisted).toEqual([{ attempts: 1, status: NotificationStatus.Sent }]);
  });

  it('rejects an old owner after lease expiry and allows only the new claim to persist results', async () => {
    const ids = await seedBroadcast(orm.em);
    const broadcast = broadcastPersistence(orm.em.fork());
    await broadcast.materializeNextBroadcastChunk(10);
    await broadcast.materializeNextBroadcastChunk(10);
    const persistenceA = deliveryPersistence(orm.em.fork());
    const persistenceB = deliveryPersistence(orm.em.fork());
    const claimedAtA = new Date(Date.now() + 1_000);
    const claimA = await persistenceA.claimPendingDeliveries({
      targetType: NotificationTargetType.Email,
      count: 1,
      now: claimedAtA,
    });
    expect(claimA).not.toBeNull();
    if (!claimA) {
      throw new Error('The first worker should own a delivery claim.');
    }

    const beforeExpiry = new Date(claimedAtA.getTime() + DeliveryClaimLeaseSeconds * 1000 - 1);
    await expect(
      persistenceB.claimPendingDeliveries({
        targetType: NotificationTargetType.Email,
        count: 1,
        now: beforeExpiry,
      }),
    ).resolves.toBeNull();

    const afterExpiry = new Date(claimedAtA.getTime() + DeliveryClaimLeaseSeconds * 1000 + 1);
    const claimB = await persistenceB.claimPendingDeliveries({
      targetType: NotificationTargetType.Email,
      count: 1,
      now: afterExpiry,
    });
    expect(claimB?.claimToken).not.toBe(claimA.claimToken);
    if (!claimB) {
      throw new Error('The second worker should reclaim the expired delivery.');
    }

    await expect(persistenceA.renewDeliveryClaim(claimA.claimToken, new Date())).resolves.toBe(false);
    const delivery = claimA.deliveries[0];
    if (!delivery) {
      throw new Error('The first claim should contain one delivery.');
    }
    const result = {
      id: delivery.delivery.id,
      createdAt: delivery.delivery.createdAt,
      claimToken: claimA.claimToken,
      status: NotificationStatus.Sent,
    };
    await persistenceA.saveClaimedDeliveryResults([result], claimA.claimToken);

    const afterStaleResult = await rows<{ attempts: number; claimToken: string; status: string }>(
      orm.em,
      'select attempts, claim_token as "claimToken", status from notification_deliveries where broadcast_id = ?',
      [ids.broadcastId],
    );
    expect(afterStaleResult).toEqual([
      { attempts: 0, claimToken: claimB.claimToken, status: NotificationStatus.Pending },
    ]);

    await persistenceB.beginClaimedDeliveryAttempts(
      [{ id: result.id, createdAt: result.createdAt }],
      claimB.claimToken,
      new Date(),
    );
    await persistenceB.saveClaimedDeliveryResults([{ ...result, claimToken: claimB.claimToken }], claimB.claimToken);
    const completed = await rows<{ attempts: number; claimToken: string; status: string }>(
      orm.em,
      'select attempts, claim_token as "claimToken", status from notification_deliveries where broadcast_id = ?',
      [ids.broadcastId],
    );
    expect(completed).toEqual([
      { attempts: 1, claimToken: EmptyNotificationDeliveryClaimId, status: NotificationStatus.Sent },
    ]);
  });

  it('quarantines an unknown provider outcome instead of reclaiming and sending it twice', async () => {
    await seedBroadcast(orm.em);
    const broadcast = broadcastPersistence(orm.em.fork());
    await broadcast.materializeNextBroadcastChunk(10);
    await broadcast.materializeNextBroadcastChunk(10);
    const persistenceA = deliveryPersistence(orm.em.fork());
    const persistenceB = deliveryPersistence(orm.em.fork());
    const claimedAt = new Date(Date.now() + 1_000);
    const claimA = await persistenceA.claimPendingDeliveries({
      targetType: NotificationTargetType.Email,
      count: 1,
      now: claimedAt,
    });
    expect(claimA).not.toBeNull();
    if (!claimA) {
      throw new Error('The first worker should own a delivery claim.');
    }
    const delivery = claimA.deliveries[0];
    if (!delivery) {
      throw new Error('The claim should contain one delivery.');
    }
    await persistenceA.beginClaimedDeliveryAttempts(
      [{ id: delivery.delivery.id, createdAt: delivery.delivery.createdAt }],
      claimA.claimToken,
      claimedAt,
    );

    const afterExpiry = new Date(claimedAt.getTime() + DeliveryClaimLeaseSeconds * 1000 + 1);
    await expect(
      persistenceB.claimPendingDeliveries({
        targetType: NotificationTargetType.Email,
        count: 1,
        now: afterExpiry,
      }),
    ).resolves.toBeNull();

    const quarantined = await rows<{ attempts: number; dispatchStartedAt: string; status: string }>(
      orm.em,
      'select attempts, dispatch_started_at as "dispatchStartedAt", status from notification_deliveries where id = ? and created_at = ?',
      [delivery.delivery.id, delivery.delivery.createdAt],
    );
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]).toMatchObject({ attempts: 1, status: NotificationStatus.Pending });
    expect(typeof quarantined[0]?.dispatchStartedAt).toBe('string');
  });
});

const notificationEntities = [
  NotificationEntitySchema,
  NotificationTemplateEntitySchema,
  NotificationTemplateVersionEntitySchema,
  NotificationTemplateVersionChannelEntitySchema,
  NotificationDeliveryEntitySchema,
  NotificationSegmentEntitySchema,
  NotificationSegmentMemberEntitySchema,
  NotificationSegmentUploadEntitySchema,
  NotificationBroadcastEntitySchema,
  NotificationBroadcastSegmentEntitySchema,
  NotificationAudienceSnapshotEntitySchema,
  NotificationAudienceSnapshotMemberEntitySchema,
  NotificationBroadcastCommandEntitySchema,
];

async function seedBroadcast(em: EntityManager): Promise<{ broadcastId: string }> {
  const templateId = randomUUID();
  const versionId = randomUUID();
  const broadcastId = randomUUID();
  const snapshotId = randomUUID();
  await em
    .getConnection()
    .execute('insert into notification_templates (id, code, name, source, status) values (?, ?, ?, ?, ?)', [
      templateId,
      `concurrency-${templateId}`,
      'Concurrency',
      'code',
      'published',
    ]);
  await em
    .getConnection()
    .execute(
      'insert into notification_template_versions (id, template_id, version, variables_schema, published_at) values (?, ?, ?, ?, now())',
      [versionId, templateId, 1, '{}'],
    );
  await em
    .getConnection()
    .execute('update notification_templates set current_version_id = ? where id = ?', [versionId, templateId]);
  await em.getConnection().execute(
    `insert into notification_broadcasts
       (id, tenant_id, name, template_version_id, channel, provider, status, created_by)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [broadcastId, randomUUID(), 'Concurrent broadcast', versionId, 'email', 'resend', 'sending', 'component-test'],
  );
  await em
    .getConnection()
    .execute(
      'insert into notification_audience_snapshots (id, broadcast_id, snapshot_at, status) values (?, ?, now(), ?)',
      [snapshotId, broadcastId, 'completed'],
    );
  await em.getConnection().execute(
    `insert into notification_audience_snapshot_members
       (id, snapshot_id, target_type, target_id, variables)
     values (?, ?, ?, ?, ?)`,
    [randomUUID(), snapshotId, 'email', 'recipient@example.test', '{}'],
  );
  em.clear();
  return { broadcastId };
}

function broadcastPersistence(em: EntityManager): PostgresNotificationBroadcastPersistence {
  return new PostgresNotificationBroadcastPersistence(em, payloadCrypto());
}

function deliveryPersistence(em: EntityManager): PostgresNotificationPersistence {
  return new PostgresNotificationPersistence(em, payloadCrypto());
}

function payloadCrypto(): NotificationPayloadCryptoService {
  return new NotificationPayloadCryptoService({
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  });
}

async function rows<T>(em: EntityManager, sql: string, params: unknown[]): Promise<T[]> {
  return await em.getConnection().execute(sql, params);
}
