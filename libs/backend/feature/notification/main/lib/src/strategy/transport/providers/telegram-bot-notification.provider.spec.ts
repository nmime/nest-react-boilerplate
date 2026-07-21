import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationErrorReason, NotificationStatus } from '@app/common-notifications';
import { TelegramBotNotificationProvider } from './telegram-bot-notification.provider';

describe(TelegramBotNotificationProvider.name, () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends a bot message through Telegram with the queued delivery id isolated from the request payload', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const provider = new TelegramBotNotificationProvider({ botToken: 'token' } as never);

    await expect(
      provider.send({ address: '123', deliveryId: 'delivery-1', message: { kind: 'bot', text: 'Hello' } }),
    ).resolves.toEqual({
      status: NotificationStatus.Sent,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/bottoken/sendMessage',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('fails closed when the Telegram provider is not configured', async () => {
    const provider = new TelegramBotNotificationProvider({ botToken: '' } as never);
    await expect(
      provider.send({ address: '123', deliveryId: 'delivery-1', message: { kind: 'bot', text: 'Hello' } }),
    ).resolves.toMatchObject({
      status: NotificationStatus.Error,
      errorReason: NotificationErrorReason.ProviderConfiguration,
    });
  });
});
