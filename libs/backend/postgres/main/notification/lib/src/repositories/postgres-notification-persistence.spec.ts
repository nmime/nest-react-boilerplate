// @requirements REQ-NOTIFY-PERSISTENCE-005
import 'reflect-metadata';
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { InvalidNotificationTemplateError } from '@app/backend-feature-notification-shared';
import {
  NotificationBroadcastStatus,
  NotificationChannel,
  NotificationDeliveryProvider,
  NotificationErrorReason,
  NotificationStatus,
  NotificationTargetType,
  NotificationTemplateEngine,
} from '@app/common-notifications';
import {
  NotificationAudienceSnapshotEntity,
  NotificationBroadcastEntity,
  EmptyNotificationDeliveryClaimId,
  EmptyNotificationDeliveryTimestamp,
  NotificationDeliveryEntity,
  NotificationEntity,
  NotificationTemplateEntity,
  NotificationTemplateVersionChannelEntity,
  NotificationTemplateVersionEntity,
} from '../infrastructure/data-access/entities';
import { NotificationPayloadCryptoService } from '../notification-payload-crypto.service';
import { PostgresNotificationBroadcastPersistence } from './postgres-notification-broadcast.persistence';
import { DeliveryClaimLeaseSeconds, PostgresNotificationPersistence } from './postgres-notification-persistence';

describe('PostgresNotificationPersistence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a complete template and channel set transactionally', async () => {
    const transaction = createTransactionEntityManager();
    transaction.findOne.mockResolvedValue(null);
    transaction.find.mockResolvedValue([]);
    const persistence = createPersistence(transaction);

    const template = await persistence.upsertTemplate({
      code: 'account-linked',
      description: 'Account link confirmation',
      channels: [
        { channel: NotificationChannel.Bot, content: { body: { en: 'Linked' } } },
        { channel: NotificationChannel.InApp, content: { body: { en: 'Linked' } } },
      ],
    });

    expect(template).toMatchObject({
      code: 'account-linked',
      description: 'Account link confirmation',
    });
    expect(Object.keys(template.channels)).toEqual([NotificationChannel.Bot, NotificationChannel.InApp]);
    // Template identity and immutable version/channel rows are persisted in one transaction, but in
    // three generations: each references the one before it through a scalar column the unit of work
    // cannot order inserts by.
    expect(transaction.persist).toHaveBeenCalledTimes(3);
    expect(transaction.flush).toHaveBeenCalledTimes(3);
  });

  it('flushes a new version before persisting the rows whose foreign key points at it', async () => {
    const transaction = createTransactionEntityManager();
    transaction.findOne.mockResolvedValue(null);
    transaction.find.mockResolvedValue([]);
    const persistence = createPersistence(transaction);

    await persistence.upsertTemplate({
      code: 'account-linked',
      channels: [{ channel: NotificationChannel.Bot, content: { body: { en: 'Linked' } } }],
    });

    // `template_version_id` and `current_version_id` are plain uuid columns rather than declared
    // relations, so the unit of work has no edge to order the inserts by. Handing it the version and
    // the rows that reference it in one flush lets it emit them in either order, and the wrong order
    // trips `notification_template_version_channels_template_version_id_foreign`.
    const versionPersist = persistOrderOf(transaction, NotificationTemplateVersionEntity);
    const channelPersist = persistOrderOf(transaction, NotificationTemplateVersionChannelEntity);
    const flushes = transaction.flush.mock.invocationCallOrder;

    expect(versionPersist).toBeLessThan(channelPersist);
    expect(flushes.some((order) => order > versionPersist && order < channelPersist)).toBe(true);
  });

  it('creates a new immutable version when code-owned channel content changes', async () => {
    const existingTemplate = new NotificationTemplateEntity({ code: 'security-alert' });
    const existingVersion = new NotificationTemplateVersionEntity({
      templateId: existingTemplate.id,
      version: 1,
      publishedAt: new Date('2026-07-20T00:00:00.000Z'),
    });
    existingTemplate.currentVersionId = existingVersion.id;
    const existingBot = new NotificationTemplateVersionChannelEntity({
      templateVersionId: existingVersion.id,
      channel: NotificationChannel.Bot,
      content: { body: { en: 'Old' } },
    });
    const transaction = createTransactionEntityManager();
    transaction.findOne
      .mockResolvedValueOnce(existingTemplate)
      .mockResolvedValueOnce(existingVersion)
      .mockResolvedValueOnce(existingVersion);
    transaction.find.mockResolvedValue([existingBot]);

    const template = await createPersistence(transaction).upsertTemplate({
      code: existingTemplate.code,
      channels: [
        {
          channel: NotificationChannel.Bot,
          engine: NotificationTemplateEngine.Eta,
          content: { body: { en: 'New' } },
        },
      ],
    });

    expect(template.channels[NotificationChannel.Bot]).toMatchObject({
      engine: NotificationTemplateEngine.Eta,
      content: { body: { en: 'New' } },
    });
    expect(template.version).toBe(2);
    expect(transaction.remove).not.toHaveBeenCalled();
  });

  it('rejects empty, duplicate, and malformed channel sets before opening a transaction', async () => {
    const transaction = createTransactionEntityManager();
    const persistence = createPersistence(transaction);

    await expect(persistence.upsertTemplate({ code: 'empty', channels: [] })).rejects.toBeInstanceOf(
      InvalidNotificationTemplateError,
    );
    await expect(
      persistence.upsertTemplate({
        code: 'duplicate',
        channels: [
          { channel: NotificationChannel.Bot, content: { body: { en: 'One' } } },
          { channel: NotificationChannel.Bot, content: { body: { en: 'Two' } } },
        ],
      }),
    ).rejects.toBeInstanceOf(InvalidNotificationTemplateError);
    await expect(
      persistence.upsertTemplate({
        code: 'malformed',
        channels: [
          {
            channel: NotificationChannel.Email,
            content: { body: { en: 'Missing subject' } },
          },
        ],
      }),
    ).rejects.toBeInstanceOf(InvalidNotificationTemplateError);
    expect(transaction.transactional).not.toHaveBeenCalled();
  });

  it('increments attempts and schedules exponential retry from delivery results', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T10:00:00.000Z'));
    const delivery = new NotificationDeliveryEntity({
      notificationId: '75f25517-d0ae-4a25-87e7-e8936a3a9e43',
      targetType: NotificationTargetType.TelegramChat,
      targetId: '123',
      channel: NotificationChannel.Bot,
      provider: NotificationDeliveryProvider.TelegramBot,
      status: NotificationStatus.Pending,
      createdAt: new Date('2026-07-16T09:00:00.000Z'),
    });
    delivery.id = '42';
    const transaction = createTransactionEntityManager();
    transaction.findOne.mockResolvedValue(delivery);

    const claimOwnershipId = '75f25517-d0ae-4a25-87e7-e8936a3a9e43';
    delivery.claimToken = claimOwnershipId;
    delivery.attempts = 1;
    delivery.dispatchStartedAt = new Date('2026-07-16T09:59:30.000Z');
    await createPersistence(transaction).saveClaimedDeliveryResults(
      [
        {
          id: delivery.id,
          createdAt: delivery.createdAt,
          claimToken: claimOwnershipId,
          status: NotificationStatus.Pending,
          error: { reason: NotificationErrorReason.RateLimit },
        },
      ],
      claimOwnershipId,
    );

    expect(delivery).toMatchObject({
      attempts: 1,
      status: NotificationStatus.Pending,
      error: { reason: NotificationErrorReason.RateLimit },
      updatedAt: new Date('2026-07-16T10:00:00.000Z'),
      sendAfter: new Date('2026-07-16T10:00:30.000Z'),
    });
    expect(transaction.flush).toHaveBeenCalledOnce();
    expect(transaction.findOne).toHaveBeenCalledWith(
      NotificationDeliveryEntity,
      expect.objectContaining({
        status: NotificationStatus.Pending,
        claimToken: claimOwnershipId,
      }),
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
  });

  it('records and releases a failed attempt completed before provider dispatch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T10:00:00.000Z'));
    const claimOwnershipId = '75f25517-d0ae-4a25-87e7-e8936a3a9e43';
    const delivery = buildPendingDelivery('42', '75f25517-d0ae-4a25-87e7-e8936a3a9e43');
    delivery.claimToken = claimOwnershipId;
    delivery.claimedAt = new Date('2026-07-16T09:59:30.000Z');
    const transaction = createTransactionEntityManager();
    transaction.findOne.mockResolvedValue(delivery);

    await createPersistence(transaction).saveClaimedDeliveryResults(
      [
        {
          id: delivery.id,
          createdAt: delivery.createdAt,
          claimToken: claimOwnershipId,
          status: NotificationStatus.Error,
          error: { reason: NotificationErrorReason.NotFoundMessage },
        },
      ],
      claimOwnershipId,
    );

    expect(delivery).toMatchObject({
      attempts: 1,
      status: NotificationStatus.Error,
      claimToken: EmptyNotificationDeliveryClaimId,
      claimedAt: new Date(0),
      dispatchStartedAt: EmptyNotificationDeliveryTimestamp,
    });
  });

  it('does not overwrite a delivery whose claim is stale or whose state changed concurrently', async () => {
    const transaction = createTransactionEntityManager();
    transaction.findOne.mockResolvedValue(null);
    const claimOwnershipId = '75f25517-d0ae-4a25-87e7-e8936a3a9e43';

    await createPersistence(transaction).saveClaimedDeliveryResults(
      [
        {
          id: '42',
          createdAt: new Date('2026-07-16T09:00:00.000Z'),
          claimToken: claimOwnershipId,
          status: NotificationStatus.Sent,
        },
      ],
      claimOwnershipId,
    );

    expect(transaction.findOne).toHaveBeenCalledWith(
      NotificationDeliveryEntity,
      expect.objectContaining({ status: NotificationStatus.Pending, claimToken: claimOwnershipId }),
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    expect(transaction.flush).toHaveBeenCalledOnce();
  });

  it('rejects a result whose embedded token differs from its claim-level token', async () => {
    const transaction = createTransactionEntityManager();

    await createPersistence(transaction).saveClaimedDeliveryResults(
      [
        {
          id: '42',
          createdAt: new Date('2026-07-16T09:00:00.000Z'),
          claimToken: 'result-claim',
          status: NotificationStatus.Sent,
        },
      ],
      'owned-claim',
    );

    expect(transaction.findOne).not.toHaveBeenCalled();
  });

  it('renews only pending rows still owned by the opaque claim token', async () => {
    const nativeUpdate = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const persistence = new PostgresNotificationPersistence(
      {
        nativeUpdate,
        transactional: async (callback: (em: { nativeUpdate: typeof nativeUpdate }) => Promise<unknown>) =>
          callback({ nativeUpdate }),
      } as unknown as EntityManager,
      notificationPayloadCrypto(),
    );
    const now = new Date('2026-07-16T10:00:00.000Z');

    await expect(persistence.renewDeliveryClaim('claim-a', now)).resolves.toBe(true);
    await expect(persistence.renewDeliveryClaim('stale-claim', now)).resolves.toBe(false);
    expect(nativeUpdate).toHaveBeenNthCalledWith(
      1,
      NotificationDeliveryEntity,
      { claimToken: 'claim-a', status: NotificationStatus.Pending },
      { claimedAt: now },
    );
  });

  it('durably marks dispatch start under the current claim before provider I/O', async () => {
    const delivery = buildPendingDelivery('42', '75f25517-d0ae-4a25-87e7-e8936a3a9e43');
    const claimOwnershipId = '75f25517-d0ae-4a25-87e7-e8936a3a9e43';
    delivery.claimToken = claimOwnershipId;
    const transaction = createTransactionEntityManager();
    transaction.findOne.mockResolvedValue(delivery);
    const now = new Date('2026-07-16T10:00:00.000Z');

    await expect(
      createPersistence(transaction).beginClaimedDeliveryAttempts(
        [{ id: delivery.id, createdAt: delivery.createdAt }],
        delivery.claimToken,
        now,
      ),
    ).resolves.toEqual([{ id: delivery.id, createdAt: delivery.createdAt }]);

    expect(delivery).toMatchObject({ attempts: 1, dispatchStartedAt: now, updatedAt: now });
    expect(transaction.findOne).toHaveBeenCalledWith(
      NotificationDeliveryEntity,
      expect.objectContaining({
        id: delivery.id,
        claimToken: delivery.claimToken,
        dispatchStartedAt: EmptyNotificationDeliveryTimestamp,
      }),
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
  });

  it('includes quarantined unknown provider outcomes in delivery health errors', async () => {
    const count = vi.fn().mockResolvedValue(2);
    const persistence = new PostgresNotificationPersistence(
      {
        count,
        transactional: async (callback: (em: { count: typeof count }) => Promise<unknown>) => callback({ count }),
      } as unknown as EntityManager,
      notificationPayloadCrypto(),
    );
    const fromDate = new Date('2026-07-16T09:00:00.000Z');

    await expect(persistence.countRecentDeliveryErrors({ fromDate, limit: 10 })).resolves.toBe(2);
    expect(count).toHaveBeenCalledWith(
      NotificationDeliveryEntity,
      expect.objectContaining({
        $or: expect.arrayContaining([
          expect.objectContaining({ status: NotificationStatus.Error }),
          expect.objectContaining({
            status: NotificationStatus.Pending,
            dispatchStartedAt: { $ne: EmptyNotificationDeliveryTimestamp },
          }),
        ]),
      }),
    );
  });

  it('fences an in-flight delivery result across pause, resume, and cancel', async () => {
    const firstClaimId = '6f00d185-c6cc-4202-a0ae-ccd02aa2f329';
    const delivery = buildPendingDelivery('42', '75f25517-d0ae-4a25-87e7-e8936a3a9e43');
    const broadcast = new NotificationBroadcastEntity({
      tenantId: '15de1900-f931-4ff9-91cd-a954125e67f7',
      name: 'Race fence',
      templateVersionId: 'c1f69d6f-7e21-45d2-981b-3b51c158174c',
      status: NotificationBroadcastStatus.Sending,
      createdBy: 'operator',
    });
    delivery.broadcastId = broadcast.id;
    delivery.claimedAt = new Date('2026-07-16T10:00:00.000Z');
    delivery.claimToken = firstClaimId;
    const transaction = createTransactionEntityManager();
    transaction.find.mockResolvedValue([]);
    transaction.findOne.mockImplementation((entity: unknown, criteria: Record<string, unknown>) => {
      if (entity === NotificationBroadcastEntity) {
        return Promise.resolve(broadcast);
      }
      if (entity === NotificationAudienceSnapshotEntity) {
        return Promise.resolve(null);
      }
      if (entity === NotificationDeliveryEntity) {
        return Promise.resolve(
          criteria['id'] === delivery.id &&
            (criteria['createdAt'] as Date).getTime() === delivery.createdAt.getTime() &&
            criteria['status'] === delivery.status &&
            criteria['claimToken'] === delivery.claimToken
            ? delivery
            : null,
        );
      }
      return Promise.resolve(null);
    });
    transaction.nativeUpdate.mockImplementation(
      async (entity: unknown, _criteria: Record<string, unknown>, update: Record<string, unknown>) => {
        if (entity === NotificationDeliveryEntity) {
          Object.assign(delivery, update);
          return 1;
        }
        return 0;
      },
    );
    const root = { transactional: transaction.transactional } as unknown as EntityManager;
    const broadcasts = new PostgresNotificationBroadcastPersistence(root, notificationPayloadCrypto());
    const notifications = new PostgresNotificationPersistence(root, notificationPayloadCrypto());
    const saveStaleResult = (claimId: string) =>
      notifications.saveClaimedDeliveryResults(
        [
          {
            id: delivery.id,
            createdAt: delivery.createdAt,
            claimToken: claimId,
            status: NotificationStatus.Sent,
          },
        ],
        claimId,
      );

    await broadcasts.transitionBroadcast({
      broadcastId: broadcast.id,
      tenantId: broadcast.tenantId,
      action: 'pause',
      idempotencyKey: 'pause',
      actorId: 'operator',
    });
    await saveStaleResult(firstClaimId);
    expect(delivery).toMatchObject({
      status: NotificationStatus.Paused,
      attempts: 0,
      claimToken: EmptyNotificationDeliveryClaimId,
      claimedAt: new Date(0),
    });

    await broadcasts.transitionBroadcast({
      broadcastId: broadcast.id,
      tenantId: broadcast.tenantId,
      action: 'resume',
      idempotencyKey: 'resume',
      actorId: 'operator',
    });
    await saveStaleResult(firstClaimId);
    expect(delivery).toMatchObject({
      status: NotificationStatus.Pending,
      attempts: 0,
      claimToken: EmptyNotificationDeliveryClaimId,
      claimedAt: new Date(0),
    });

    const secondClaimId = '96212ed7-d22b-40d6-a473-244b72f13722';
    delivery.claimToken = secondClaimId;
    delivery.claimedAt = new Date('2026-07-16T10:05:00.000Z');
    await broadcasts.transitionBroadcast({
      broadcastId: broadcast.id,
      tenantId: broadcast.tenantId,
      action: 'cancel',
      idempotencyKey: 'cancel',
      actorId: 'operator',
    });
    await saveStaleResult(secondClaimId);
    expect(delivery).toMatchObject({
      status: NotificationStatus.Cancelled,
      attempts: 0,
      claimToken: EmptyNotificationDeliveryClaimId,
      claimedAt: new Date(0),
    });
    expect(transaction.findOne).toHaveBeenCalledWith(
      NotificationDeliveryEntity,
      expect.objectContaining({ status: NotificationStatus.Pending }),
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
  });

  it.each([
    [NotificationBroadcastStatus.Paused, 1],
    [NotificationBroadcastStatus.Cancelled, 0],
  ] as const)(
    'revalidates a stale statistics candidate after a concurrent %s transition',
    async (concurrentStatus, expectedRefreshes) => {
      const staleCandidate = new NotificationBroadcastEntity({
        tenantId: '15de1900-f931-4ff9-91cd-a954125e67f7',
        name: 'Statistics race',
        templateVersionId: 'c1f69d6f-7e21-45d2-981b-3b51c158174c',
        status: NotificationBroadcastStatus.Sending,
        materializedAt: new Date('2026-07-27T10:00:00.000Z'),
        createdBy: 'operator',
      });
      const current = new NotificationBroadcastEntity({
        ...staleCandidate,
        status: concurrentStatus,
      });
      const transaction = {
        find: vi.fn().mockResolvedValue([staleCandidate]),
        findOne: vi.fn().mockResolvedValue(concurrentStatus === NotificationBroadcastStatus.Paused ? current : null),
        count: vi.fn().mockResolvedValue(0),
        flush: vi.fn().mockResolvedValue(undefined),
      };
      const root = {
        find: vi.fn().mockResolvedValue([staleCandidate]),
        transactional: vi.fn(async (callback: (em: typeof transaction) => Promise<unknown>) => callback(transaction)),
      } as unknown as EntityManager;
      const persistence = new PostgresNotificationBroadcastPersistence(root, notificationPayloadCrypto());

      await expect(persistence.refreshBroadcastStatistics()).resolves.toBe(expectedRefreshes);

      expect(staleCandidate.status).toBe(NotificationBroadcastStatus.Sending);
      expect(current.status).toBe(concurrentStatus);
      expect(transaction.findOne).toHaveBeenCalledWith(
        NotificationBroadcastEntity,
        {
          id: staleCandidate.id,
          status: { $in: [NotificationBroadcastStatus.Sending, NotificationBroadcastStatus.Paused] },
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      expect(transaction.flush).toHaveBeenCalledTimes(expectedRefreshes);
    },
  );

  it('persists an explicit provider and encrypts sensitive template values', async () => {
    const template = new NotificationTemplateEntity({ code: 'auth.email-verification-code' });
    const version = publishedVersion(template);
    const emailChannel = new NotificationTemplateVersionChannelEntity({
      templateVersionId: version.id,
      channel: NotificationChannel.Email,
      content: { subject: { en: 'Verify' }, body: { en: 'Code: {code}' } },
    });
    const transaction = createTransactionEntityManager();
    transaction.findOne.mockResolvedValueOnce(template).mockResolvedValueOnce(version);
    transaction.find.mockResolvedValue([emailChannel]);

    await createPersistence(transaction).create({
      targetType: NotificationTargetType.Email,
      targetId: 'user@example.com',
      templateCode: template.code,
      deliveries: [{ channel: NotificationChannel.Email, provider: NotificationDeliveryProvider.Resend }],
      inAppVisible: false,
      sensitiveData: { code: 'secret-code' },
    });

    const persisted = transaction.persist.mock.calls[0]?.[0] as [NotificationEntity, NotificationDeliveryEntity];
    expect(persisted[0].sensitiveData.ciphertext).not.toContain('secret-code');
    expect(persisted[1].provider).toBe(NotificationDeliveryProvider.Resend);
  });

  it('joins pending deliveries to notifications with their pinned version channels', async () => {
    const template = new NotificationTemplateEntity({ code: 'welcome' });
    const version = publishedVersion(template);
    const botChannel = new NotificationTemplateVersionChannelEntity({
      templateVersionId: version.id,
      channel: NotificationChannel.Bot,
      content: { body: { en: 'Hi' } },
    });
    const inAppChannel = new NotificationTemplateVersionChannelEntity({
      templateVersionId: version.id,
      channel: NotificationChannel.InApp,
      content: { body: { en: 'Hi' } },
    });
    const notification = new NotificationEntity({
      targetType: NotificationTargetType.TelegramChat,
      targetId: '123',
      template,
      templateVersionId: version.id,
    });
    const deliveryA = buildPendingDelivery('1', notification.id);
    const deliveryB = buildPendingDelivery('2', notification.id);
    const find = vi.fn();
    find.mockImplementation((entity: unknown) => {
      if (entity === NotificationDeliveryEntity) {
        return Promise.resolve([deliveryA, deliveryB]);
      }
      if (entity === NotificationEntity) {
        return Promise.resolve([notification]);
      }
      if (entity === NotificationTemplateVersionChannelEntity) {
        return Promise.resolve([botChannel, inAppChannel]);
      }
      if (entity === NotificationTemplateVersionEntity) {
        return Promise.resolve([version]);
      }
      return Promise.resolve([]);
    });
    const now = new Date('2026-07-16T10:00:00.000Z');

    const claim = await createReadPersistence(find).claimPendingDeliveries({
      targetType: NotificationTargetType.TelegramChat,
      count: 10,
      now,
    });

    expect(find).toHaveBeenNthCalledWith(
      1,
      NotificationDeliveryEntity,
      expect.objectContaining({
        targetType: NotificationTargetType.TelegramChat,
        status: NotificationStatus.Pending,
        sendAfter: { $lte: now },
        dispatchStartedAt: EmptyNotificationDeliveryTimestamp,
      }),
      expect.objectContaining({ limit: 10, orderBy: { priority: 'DESC', id: 'ASC' } }),
    );
    // Both deliveries reference the same notification, so notificationIds must be deduped.
    expect(find).toHaveBeenNthCalledWith(
      2,
      NotificationEntity,
      { id: { $in: [notification.id] } },
      { populate: ['template'] },
    );
    expect(claim?.deliveries).toHaveLength(2);
    expect(claim?.deliveries.map((item) => item.delivery.id)).toEqual(['1', '2']);
    expect(Object.keys(claim?.deliveries[0]?.notification.template.channels ?? {})).toEqual([
      NotificationChannel.Bot,
      NotificationChannel.InApp,
    ]);
  });

  it('drops pending deliveries whose notification is missing', async () => {
    const template = new NotificationTemplateEntity({ code: 'welcome' });
    const version = publishedVersion(template);
    const botChannel = new NotificationTemplateVersionChannelEntity({
      templateVersionId: version.id,
      channel: NotificationChannel.Bot,
      content: { body: { en: 'Hi' } },
    });
    const notification = new NotificationEntity({
      targetType: NotificationTargetType.TelegramChat,
      targetId: '123',
      template,
      templateVersionId: version.id,
    });
    const presentDelivery = buildPendingDelivery('1', notification.id);
    const orphanDelivery = buildPendingDelivery('2', 'df6b6d7c-2f2b-4a2f-9c6c-2f2b4a2f9c6c');
    const find = vi.fn();
    find.mockImplementation((entity: unknown) => {
      if (entity === NotificationDeliveryEntity) {
        return Promise.resolve([presentDelivery, orphanDelivery]);
      }
      if (entity === NotificationEntity) {
        return Promise.resolve([notification]);
      }
      if (entity === NotificationTemplateVersionChannelEntity) {
        return Promise.resolve([botChannel]);
      }
      if (entity === NotificationTemplateVersionEntity) {
        return Promise.resolve([version]);
      }
      return Promise.resolve([]);
    });

    const claim = await createReadPersistence(find).claimPendingDeliveries({
      targetType: NotificationTargetType.TelegramChat,
      count: 10,
      now: new Date('2026-07-16T10:00:00.000Z'),
    });

    expect(claim?.deliveries).toHaveLength(1);
    expect(claim?.deliveries[0]?.delivery.id).toBe('1');
  });

  it('returns early and skips follow-up queries when no deliveries are pending', async () => {
    const find = vi.fn();
    find.mockResolvedValue([]);

    const claim = await createReadPersistence(find).claimPendingDeliveries({
      targetType: NotificationTargetType.TelegramChat,
      count: 10,
      now: new Date('2026-07-16T10:00:00.000Z'),
    });

    expect(claim).toBeNull();
    expect(find).toHaveBeenCalledOnce();
  });

  it('atomically claims fetched deliveries with SKIP LOCKED and a lease so concurrent workers cannot double-send', async () => {
    const template = new NotificationTemplateEntity({ code: 'welcome' });
    const version = publishedVersion(template);
    const botChannel = new NotificationTemplateVersionChannelEntity({
      templateVersionId: version.id,
      channel: NotificationChannel.Bot,
      content: { body: { en: 'Hi' } },
    });
    const notification = new NotificationEntity({
      targetType: NotificationTargetType.TelegramChat,
      targetId: '123',
      template,
      templateVersionId: version.id,
    });
    const delivery = buildPendingDelivery('1', notification.id);
    const now = new Date('2026-07-16T10:00:00.000Z');

    const find = vi.fn().mockImplementation((entity: unknown) => {
      if (entity === NotificationDeliveryEntity) {
        return Promise.resolve([delivery]);
      }
      if (entity === NotificationEntity) {
        return Promise.resolve([notification]);
      }
      if (entity === NotificationTemplateVersionChannelEntity) {
        return Promise.resolve([botChannel]);
      }
      if (entity === NotificationTemplateVersionEntity) {
        return Promise.resolve([version]);
      }
      return Promise.resolve([]);
    });
    const flush = vi.fn().mockResolvedValue(undefined);
    const transaction = { find, flush };
    const transactional = vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
    );
    const persistence = new PostgresNotificationPersistence(
      {
        find,
        flush,
        transactional,
      } as unknown as EntityManager,
      notificationPayloadCrypto(),
    );

    const claim = await persistence.claimPendingDeliveries({
      targetType: NotificationTargetType.TelegramChat,
      count: 10,
      now,
    });

    // The claim runs inside a transaction and uses FOR UPDATE SKIP LOCKED so two
    // workers/replicas never select the same delivery.
    expect(transactional).toHaveBeenCalledOnce();
    const deliveryQuery = find.mock.calls.find((call) => call[0] === NotificationDeliveryEntity);
    expect(deliveryQuery?.[2]).toMatchObject({ lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE });
    // Only rows that are unclaimed (or whose lease has expired) are eligible.
    expect(deliveryQuery?.[1]).toMatchObject({
      claimedAt: { $lte: new Date(now.getTime() - DeliveryClaimLeaseSeconds * 1000) },
    });
    // The claim stamps claimedAt = now and persists it before returning, so a crash
    // between claim and save cannot re-send until the lease elapses.
    expect(delivery.claimedAt).toEqual(now);
    expect(delivery.claimToken).toBe(claim?.claimToken);
    expect(claim?.leaseExpiresAt).toEqual(new Date(now.getTime() + DeliveryClaimLeaseSeconds * 1000));
    expect(flush).toHaveBeenCalled();
    expect(claim?.deliveries).toHaveLength(1);
  });
});

function createReadPersistence(find: Mock, flush: Mock = vi.fn().mockResolvedValue(undefined)) {
  const transaction = { find, flush };
  const root = {
    find,
    flush,
    transactional: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
  } as unknown as EntityManager;
  return new PostgresNotificationPersistence(root, notificationPayloadCrypto());
}

function publishedVersion(template: NotificationTemplateEntity): NotificationTemplateVersionEntity {
  const version = new NotificationTemplateVersionEntity({
    templateId: template.id,
    version: 1,
    publishedAt: new Date('2026-07-20T00:00:00.000Z'),
  });
  template.currentVersionId = version.id;
  return version;
}

function buildPendingDelivery(id: string, notificationId: string): NotificationDeliveryEntity {
  const delivery = new NotificationDeliveryEntity({
    notificationId,
    targetType: NotificationTargetType.TelegramChat,
    targetId: '123',
    channel: NotificationChannel.Bot,
    provider: NotificationDeliveryProvider.TelegramBot,
    status: NotificationStatus.Pending,
    createdAt: new Date('2026-07-16T09:00:00.000Z'),
  });
  delivery.id = id;
  return delivery;
}

/** Named separately so the failure message can quote the class the caller asked about. */
type EntityConstructor = (abstract new (...args: never[]) => unknown) & { readonly name: string };

/**
 * When the given entity type first reaches `persist`, on the shared invocation clock vitest keeps
 * across every mock. `persist` takes either one entity or an array, so both shapes are searched.
 */
function persistOrderOf(
  transaction: ReturnType<typeof createTransactionEntityManager>,
  entityType: EntityConstructor,
): number {
  const index = transaction.persist.mock.calls.findIndex(([persisted]) =>
    (Array.isArray(persisted) ? persisted : [persisted]).some((entity) => entity instanceof entityType),
  );

  expect(index, `${entityType.name} was never persisted`).toBeGreaterThanOrEqual(0);

  return transaction.persist.mock.invocationCallOrder[index] ?? Number.NaN;
}

function createPersistence(transaction: ReturnType<typeof createTransactionEntityManager>) {
  const root = {
    transactional: transaction.transactional,
  } as unknown as EntityManager;
  return new PostgresNotificationPersistence(root, notificationPayloadCrypto());
}

function notificationPayloadCrypto(): NotificationPayloadCryptoService {
  return new NotificationPayloadCryptoService({
    NOTIFICATION_PAYLOAD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  });
}

function createTransactionEntityManager() {
  const transaction = {
    findOne: vi.fn(),
    find: vi.fn(),
    persist: vi.fn(),
    remove: vi.fn(),
    nativeUpdate: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    transactional: vi.fn(),
  };
  transaction.transactional.mockImplementation(async (callback: (em: typeof transaction) => Promise<unknown>) =>
    callback(transaction),
  );
  return transaction;
}
