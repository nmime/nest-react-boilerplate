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

  it('maps rich Telegram message options without leaking provider-specific shapes into templates', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const provider = new TelegramBotNotificationProvider({ botToken: 'token' } as never);

    await provider.send({
      address: '123',
      deliveryId: 'delivery-2',
      message: {
        kind: 'bot',
        text: '<b>Hello</b>',
        buttons: [
          [{ text: 'Open', url: 'https://example.com', iconCustomEmojiId: 'emoji-1' }],
          [{ text: 'Search', switchInlineQuery: '' }],
        ],
      },
      extra: {
        disableNotification: true,
        disableWebPagePreview: false,
        linkPreviewUrl: 'https://example.com/preview',
      },
    });

    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(typeof request.body === 'string' ? request.body : '')).toEqual({
      chat_id: '123',
      text: '<b>Hello</b>',
      parse_mode: 'HTML',
      disable_notification: true,
      link_preview_options: { is_disabled: false, url: 'https://example.com/preview' },
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Open', url: 'https://example.com', icon_custom_emoji_id: 'emoji-1' }],
          [{ text: 'Search', switch_inline_query: '' }],
        ],
      },
    });
  });

  it('does not send link preview options with photo messages', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const provider = new TelegramBotNotificationProvider({ botToken: 'token' } as never);

    await provider.send({
      address: '123',
      deliveryId: 'delivery-3',
      message: { kind: 'bot', image: 'https://example.com/image.png', text: '<b>Caption</b>' },
      extra: { disableWebPagePreview: true, linkPreviewUrl: 'https://example.com/preview' },
    });

    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(typeof request.body === 'string' ? request.body : '')).toEqual({
      chat_id: '123',
      photo: 'https://example.com/image.png',
      caption: '<b>Caption</b>',
      parse_mode: 'HTML',
    });
  });

  it('rejects an invalid button instead of silently replacing its action', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const provider = new TelegramBotNotificationProvider({ botToken: 'token' } as never);

    await expect(
      provider.send({
        address: '123',
        deliveryId: 'delivery-4',
        message: { kind: 'bot', text: 'Hello', buttons: [[{ text: 'Broken' }]] },
      }),
    ).resolves.toMatchObject({
      status: NotificationStatus.Error,
      errorReason: NotificationErrorReason.InvalidMessage,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
