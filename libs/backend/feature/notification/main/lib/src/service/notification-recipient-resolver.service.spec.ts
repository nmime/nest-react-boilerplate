import { describe, expect, it, vi } from 'vitest';
import { NotificationChannel, NotificationTargetType } from '@app/common-notifications';
import { NotificationRecipientResolverService } from './notification-recipient-resolver.service';

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

  it('returns no recipient for failed lookups or users without Telegram', async () => {
    const findByUser = vi
      .fn()
      .mockResolvedValueOnce({ isErr: () => true })
      .mockResolvedValueOnce({ isErr: () => false, value: [{ provider: 'discord' }] });
    const resolver = new NotificationRecipientResolverService({ findByUser } as never);

    await expect(
      resolver.resolve(NotificationTargetType.User, 'missing-1', NotificationChannel.Bot),
    ).resolves.toBeNull();
    await expect(
      resolver.resolve(NotificationTargetType.User, 'missing-2', NotificationChannel.Bot),
    ).resolves.toBeNull();
  });
});
