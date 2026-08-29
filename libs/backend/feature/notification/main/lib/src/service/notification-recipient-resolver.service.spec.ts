// @requirements REQ-NOTIFY-AUDIENCE-004
// Evidence for: REQ-NOTIFY-AUDIENCE-004
import { describe, expect, it, vi } from 'vitest';
import {
  NotificationChannel,
  NotificationDeliveryProvider,
  NotificationStatus,
  NotificationTargetType,
  type NotificationDeliveryRecord,
} from '@app/common-notifications';
import {
  NotificationRecipientLookupError,
  NotificationRecipientResolverService,
} from './notification-recipient-resolver.service';

describe(NotificationRecipientResolverService.name, () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const telegramDelivery: NotificationDeliveryRecord = {
    id: 'delivery-1',
    notificationId: 'notification-1',
    targetType: NotificationTargetType.User,
    targetId: 'user-1',
    channel: NotificationChannel.Bot,
    provider: NotificationDeliveryProvider.TelegramBot,
    status: NotificationStatus.Pending,
    error: null,
    attempts: 0,
    priority: 100,
    sendAfter: new Date(),
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('uses direct Telegram chat targets only for the bot channel', async () => {
    const findByUser = vi.fn();
    const resolver = new NotificationRecipientResolverService({ findByUser } as never, {} as never);

    await expect(
      resolver.resolve(tenantId, NotificationTargetType.TelegramChat, 'chat-1', telegramDelivery),
    ).resolves.toEqual({
      address: 'chat-1',
    });
    await expect(
      resolver.resolve(tenantId, NotificationTargetType.SystemTelegramChat, 'chat-2', telegramDelivery),
    ).resolves.toEqual({ address: 'chat-2' });
    await expect(
      resolver.resolve(tenantId, NotificationTargetType.User, 'user-1', {
        ...telegramDelivery,
        channel: NotificationChannel.Email,
      }),
    ).resolves.toBeNull();
    expect(findByUser).not.toHaveBeenCalled();
  });

  it('resolves a user Telegram identity and its locale', async () => {
    const findByUser = vi.fn().mockResolvedValue({
      isErr: () => false,
      value: [
        { provider: 'discord', providerSubject: 'discord-1' },
        { provider: 'telegram', providerSubject: 'telegram-1', locale: 'ru' },
      ],
    });
    const resolver = new NotificationRecipientResolverService({ findByUser } as never, {} as never);

    await expect(resolver.resolve(tenantId, NotificationTargetType.User, 'user-1', telegramDelivery)).resolves.toEqual({
      address: 'telegram-1',
      language: 'ru',
    });
    expect(findByUser).toHaveBeenCalledWith('user-1', tenantId);
  });

  it('resolves a user email only inside the notification tenant', async () => {
    const findById = vi.fn().mockResolvedValue({
      isErr: () => false,
      value: { email: 'Tenant.User@Example.com', locale: 'en' },
    });
    const resolver = new NotificationRecipientResolverService({} as never, { findById } as never);

    await expect(
      resolver.resolve(tenantId, NotificationTargetType.User, 'user-1', {
        ...telegramDelivery,
        channel: NotificationChannel.Email,
        provider: NotificationDeliveryProvider.Resend,
      }),
    ).resolves.toEqual({ address: 'tenant.user@example.com', language: 'en' });
    expect(findById).toHaveBeenCalledWith('user-1', tenantId);
  });

  it('returns no recipient for a user without a Telegram identity', async () => {
    const findByUser = vi.fn().mockResolvedValue({ isErr: () => false, value: [{ provider: 'discord' }] });
    const resolver = new NotificationRecipientResolverService({ findByUser } as never, {} as never);

    await expect(
      resolver.resolve(tenantId, NotificationTargetType.User, 'missing-1', telegramDelivery),
    ).resolves.toBeNull();
  });

  it('throws (rather than dropping the delivery) when the identity lookup fails transiently', async () => {
    const findByUser = vi
      .fn()
      .mockResolvedValue({ isErr: () => true, error: { code: 'repository_error', message: 'db unavailable' } });
    const resolver = new NotificationRecipientResolverService({ findByUser } as never, {} as never);

    await expect(
      resolver.resolve(tenantId, NotificationTargetType.User, 'user-1', telegramDelivery),
    ).rejects.toBeInstanceOf(NotificationRecipientLookupError);
  });
});
