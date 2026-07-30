// @requirements REQ-NOTIFY-TEMPLATE-003
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationErrorReason, NotificationStatus } from '@app/common-notifications';
import { DiscordBotNotificationProvider } from './discord-bot-notification.provider';

describe(DiscordBotNotificationProvider.name, () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends images, safe mentions, buttons, and the silent flag to a DM channel', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'channel-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'message-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const provider = new DiscordBotNotificationProvider({ discordBotToken: 'token' } as never);
    const markDispatchStarted = vi.fn(async () => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    await expect(
      provider.send({
        address: 'user-1',
        deliveryId: 'delivery-1',
        extra: { disableNotification: true },
        markDispatchStarted,
        message: {
          kind: 'bot',
          text: 'Hello @everyone',
          image: 'https://example.com/banner.png',
          buttons: [
            [
              { text: 'Open', url: 'https://example.com' },
              { text: 'Confirm', callback: 'confirm' },
            ],
          ],
        },
      }),
    ).resolves.toEqual({ status: NotificationStatus.Sent });
    expect(markDispatchStarted).toHaveBeenCalledOnce();

    const request = fetch.mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(typeof request.body === 'string' ? request.body : '')).toEqual({
      content: 'Hello @everyone',
      allowed_mentions: { parse: [] },
      embeds: [{ image: { url: 'https://example.com/banner.png' } }],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 5, label: 'Open', url: 'https://example.com' },
            { type: 2, style: 1, label: 'Confirm', custom_id: 'confirm' },
          ],
        },
      ],
      flags: 4096,
    });
  });

  it('honors Discord rate-limit retry metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'slow down', retry_after: 1.2 }), {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const provider = new DiscordBotNotificationProvider({ discordBotToken: 'token' } as never);
    const markDispatchStarted = vi.fn().mockResolvedValue(undefined);
    await expect(
      provider.send({
        address: 'user-1',
        deliveryId: 'delivery-2',
        markDispatchStarted,
        message: { kind: 'bot', text: 'Hello' },
      }),
    ).resolves.toMatchObject({
      status: NotificationStatus.Pending,
      errorReason: NotificationErrorReason.RateLimit,
      retryAfterSeconds: 2,
    });
    expect(markDispatchStarted).not.toHaveBeenCalled();
  });

  it('rejects Telegram-only actions before making a request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const provider = new DiscordBotNotificationProvider({ discordBotToken: 'token' } as never);
    const markDispatchStarted = vi.fn().mockResolvedValue(undefined);
    await expect(
      provider.send({
        address: 'user-1',
        deliveryId: 'delivery-3',
        markDispatchStarted,
        message: { kind: 'bot', text: 'Hello', buttons: [[{ text: 'Open', webApp: 'https://example.com' }]] },
      }),
    ).resolves.toMatchObject({
      status: NotificationStatus.Error,
      errorReason: NotificationErrorReason.InvalidMessage,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(markDispatchStarted).not.toHaveBeenCalled();
  });
});
