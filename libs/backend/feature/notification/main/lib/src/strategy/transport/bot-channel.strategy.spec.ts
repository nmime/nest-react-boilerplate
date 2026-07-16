import { describe, expect, it, vi } from 'vitest';
import { NotificationErrorReason, NotificationStatus } from '@app/common-notifications';
import { BotChannelStrategy } from './bot-channel.strategy';

describe(BotChannelStrategy.name, () => {
  it('sends through the real Telegram API adapter', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
    const strategy = new BotChannelStrategy({ bot: { api: { sendMessage } } } as never);

    await expect(strategy.send({ telegramId: '123', message: { text: 'Hello' } })).resolves.toEqual({
      status: NotificationStatus.Sent,
    });
    expect(sendMessage).toHaveBeenCalledOnce();
  });

  it('does not claim success when Telegram is not wired', async () => {
    const strategy = new BotChannelStrategy();
    await expect(strategy.send({ telegramId: '123', message: { text: 'Hello' } })).resolves.toMatchObject({
      status: NotificationStatus.Error,
      errorReason: NotificationErrorReason.UnsupportedChannel,
    });
  });
});
