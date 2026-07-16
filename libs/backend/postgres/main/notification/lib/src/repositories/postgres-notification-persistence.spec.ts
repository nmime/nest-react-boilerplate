import 'reflect-metadata';
import type { EntityManager } from '@mikro-orm/postgresql';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  NotificationTemplateChannelEntity,
  NotificationTemplateEntity,
} from '../infrastructure/data-access/entities';
import { PostgresNotificationPersistence } from './postgres-notification-persistence';

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
});

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
