import { describe, expect, it, vi } from 'vitest';
import { NotificationChannel, NotificationTargetType } from '@app/common-notifications';
import {
  NotificationRecipientLookupError,
  NotificationRecipientResolverService,
} from './notification-recipient-resolver.service';

describe(NotificationRecipientResolverService.name, () => {
  it('uses direct Telegram chat targets only for the bot channel', async () => {
    const findByUser = vi.fn();
    const resolver = new NotificationRecipientResolverService({ findByUser } as never);

    await expect(
      resolver.resolve(NotificationTargetType.TelegramChat, 'chat-1', NotificationChannel.Bot),
    ).resolves.toEqual({ address: 'chat-1' });
    await expect(
      resolver.resolve(NotificationTargetType.SystemTelegramChat, 'chat-2', NotificationChannel.Bot),
    ).resolves.toEqual({ address: 'chat-2' });
    await expect(
      resolver.resolve(NotificationTargetType.User, 'user-1', NotificationChannel.Email),
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
    const resolver = new NotificationRecipientResolverService({ findByUser } as never);

    await expect(resolver.resolve(NotificationTargetType.User, 'user-1', NotificationChannel.Bot)).resolves.toEqual({
      address: 'telegram-1',
      language: 'ru',
    });
  });

  it('returns no recipient for a user without a Telegram identity', async () => {
    const findByUser = vi.fn().mockResolvedValue({ isErr: () => false, value: [{ provider: 'discord' }] });
    const resolver = new NotificationRecipientResolverService({ findByUser } as never);

    await expect(
      resolver.resolve(NotificationTargetType.User, 'missing-1', NotificationChannel.Bot),
    ).resolves.toBeNull();
  });

  it('throws (rather than dropping the delivery) when the identity lookup fails transiently', async () => {
    const findByUser = vi
      .fn()
      .mockResolvedValue({ isErr: () => true, error: { code: 'repository_error', message: 'db unavailable' } });
    const resolver = new NotificationRecipientResolverService({ findByUser } as never);

    await expect(
      resolver.resolve(NotificationTargetType.User, 'user-1', NotificationChannel.Bot),
    ).rejects.toBeInstanceOf(NotificationRecipientLookupError);
  });
});
