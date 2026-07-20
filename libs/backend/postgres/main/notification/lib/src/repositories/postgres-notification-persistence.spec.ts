import 'reflect-metadata';
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { InvalidNotificationTemplateError } from '@app/backend-feature-notification-shared';
import {
  NotificationChannel,
  NotificationErrorReason,
  NotificationStatus,
  NotificationTargetType,
  NotificationTemplateEngine,
} from '@app/common-notifications';
import {
  NotificationDeliveryEntity,
  NotificationEntity,
  NotificationTemplateChannelEntity,
  NotificationTemplateEntity,
} from '../infrastructure/data-access/entities';
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
    expect(transaction.persist).toHaveBeenCalledTimes(2);
    expect(transaction.flush).toHaveBeenCalledOnce();
  });

  it('replaces stale channels and updates existing channel content', async () => {
    const existingTemplate = new NotificationTemplateEntity({ code: 'security-alert' });
    const existingBot = new NotificationTemplateChannelEntity({
      templateId: existingTemplate.id,
      channel: NotificationChannel.Bot,
      content: { body: { en: 'Old' } },
    });
    const staleEmail = new NotificationTemplateChannelEntity({
      templateId: existingTemplate.id,
      channel: NotificationChannel.Email,
      content: { subject: { en: 'Old' }, body: { en: 'Old' } },
    });
    const transaction = createTransactionEntityManager();
    transaction.findOne.mockResolvedValue(existingTemplate);
    transaction.find.mockResolvedValue([existingBot, staleEmail]);

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
    expect(transaction.remove).toHaveBeenCalledWith([staleEmail]);
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
      status: NotificationStatus.Pending,
      createdAt: new Date('2026-07-16T09:00:00.000Z'),
    });
    delivery.id = '42';
    const transaction = createTransactionEntityManager();
    transaction.findOne.mockResolvedValue(delivery);

    await createPersistence(transaction).saveDeliveryResults([
      {
        id: delivery.id,
        createdAt: delivery.createdAt,
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

  it('joins pending deliveries to notifications with grouped template channels', async () => {
    const template = new NotificationTemplateEntity({ code: 'welcome' });
    const botChannel = new NotificationTemplateChannelEntity({
      templateId: template.id,
      channel: NotificationChannel.Bot,
      content: { body: { en: 'Hi' } },
    });
    const inAppChannel = new NotificationTemplateChannelEntity({
      templateId: template.id,
      channel: NotificationChannel.InApp,
      content: { body: { en: 'Hi' } },
    });
    const notification = new NotificationEntity({
      targetType: NotificationTargetType.TelegramChat,
      targetId: '123',
      template,
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
      if (entity === NotificationTemplateChannelEntity) {
        return Promise.resolve([botChannel, inAppChannel]);
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
    const botChannel = new NotificationTemplateChannelEntity({
      templateId: template.id,
      channel: NotificationChannel.Bot,
      content: { body: { en: 'Hi' } },
    });
    const notification = new NotificationEntity({
      targetType: NotificationTargetType.TelegramChat,
      targetId: '123',
      template,
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
      if (entity === NotificationTemplateChannelEntity) {
        return Promise.resolve([botChannel]);
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
    const botChannel = new NotificationTemplateChannelEntity({
      templateId: template.id,
      channel: NotificationChannel.Bot,
      content: { body: { en: 'Hi' } },
    });
    const notification = new NotificationEntity({
      targetType: NotificationTargetType.TelegramChat,
      targetId: '123',
      template,
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
      if (entity === NotificationTemplateChannelEntity) {
        return Promise.resolve([botChannel]);
      }
      return Promise.resolve([]);
    });
    const flush = vi.fn().mockResolvedValue(undefined);
    const transaction = { find, flush };
    const transactional = vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
    );
    const persistence = new PostgresNotificationPersistence({
      find,
      flush,
      transactional,
    } as unknown as EntityManager);

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
  return new PostgresNotificationPersistence(root);
}

function buildPendingDelivery(id: string, notificationId: string): NotificationDeliveryEntity {
  const delivery = new NotificationDeliveryEntity({
    notificationId,
    targetType: NotificationTargetType.TelegramChat,
    targetId: '123',
    channel: NotificationChannel.Bot,
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
  return new PostgresNotificationPersistence(root);
}

function createTransactionEntityManager() {
  const transaction = {
    findOne: vi.fn(),
    find: vi.fn(),
    persist: vi.fn(),
    remove: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    transactional: vi.fn(),
  };
  transaction.transactional.mockImplementation(async (callback: (em: typeof transaction) => Promise<unknown>) =>
    callback(transaction),
  );
  return transaction;
}
