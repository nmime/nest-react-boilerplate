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
  NotificationDeliveryEntity,
  NotificationEntity,
  NotificationTemplateEntity,
  NotificationTemplateVersionChannelEntity,
  NotificationTemplateVersionEntity,
  UnclaimedNotificationDeliveryClaimId,
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
    // Template identity and immutable version/channel rows are persisted in one transaction.
    expect(transaction.persist).toHaveBeenCalledTimes(2);
    expect(transaction.flush).toHaveBeenCalledOnce();
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
    const claimId = '6f00d185-c6cc-4202-a0ae-ccd02aa2f329';
    delivery.claimToken = claimId;
    const transaction = createTransactionEntityManager();
    transaction.findOne.mockResolvedValue(delivery);

    await createPersistence(transaction).saveDeliveryResults([
      {
        id: delivery.id,
        createdAt: delivery.createdAt,
        claimToken: delivery.claimToken,
        status: NotificationStatus.Pending,
        error: { reason: NotificationErrorReason.RateLimit },
      },
    ]);

    expect(delivery).toMatchObject({
      attempts: 1,
      status: NotificationStatus.Pending,
      error: { reason: NotificationErrorReason.RateLimit },
      updatedAt: new Date('2026-07-16T10:00:00.000Z'),
      sendAfter: new Date('2026-07-16T10:00:30.000Z'),
    });
    expect(transaction.flush).toHaveBeenCalledOnce();
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
      notifications.saveDeliveryResults([
        {
          id: delivery.id,
          createdAt: delivery.createdAt,
          claimToken: claimId,
          status: NotificationStatus.Sent,
        },
      ]);

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
      claimToken: UnclaimedNotificationDeliveryClaimId,
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
      claimToken: UnclaimedNotificationDeliveryClaimId,
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
      claimToken: UnclaimedNotificationDeliveryClaimId,
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

    const pending = await createReadPersistence(find).findPendingDeliveries({
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
    expect(pending).toHaveLength(2);
    expect(pending.map((item) => item.delivery.id)).toEqual(['1', '2']);
    expect(Object.keys(pending[0]?.notification.template.channels ?? {})).toEqual([
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

    const pending = await createReadPersistence(find).findPendingDeliveries({
      targetType: NotificationTargetType.TelegramChat,
      count: 10,
      now: new Date('2026-07-16T10:00:00.000Z'),
    });

    expect(pending).toHaveLength(1);
    expect(pending[0]?.delivery.id).toBe('1');
  });

  it('returns early and skips follow-up queries when no deliveries are pending', async () => {
    const find = vi.fn();
    find.mockResolvedValue([]);

    const pending = await createReadPersistence(find).findPendingDeliveries({
      targetType: NotificationTargetType.TelegramChat,
      count: 10,
      now: new Date('2026-07-16T10:00:00.000Z'),
    });

    expect(pending).toEqual([]);
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

    const pending = await persistence.findPendingDeliveries({
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
    expect(flush).toHaveBeenCalled();
    expect(pending).toHaveLength(1);
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
