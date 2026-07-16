import { describe, expect, it, vi } from 'vitest';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationTargetType,
  type PendingNotificationDelivery,
} from '@app/common-notifications';
import { UserNotificationStrategy } from './user-notification.strategy';

describe(UserNotificationStrategy.name, () => {
  it('resolves the user before delivering and returns delivery state', async () => {
    const pending = {
      delivery: { id: '1', createdAt: new Date(), channel: NotificationChannel.Bot },
      notification: {
        id: 'notification-1',
        targetType: NotificationTargetType.User,
        targetId: 'user-1',
        extra: null,
      },
    } as PendingNotificationDelivery;
    const send = vi.fn().mockResolvedValue({ status: NotificationStatus.Sent });
    const result = await new UserNotificationStrategy().handleNotification({
      pending,
      recipientResolver: { resolve: vi.fn().mockResolvedValue({ address: '123' }) } as never,
      messageStrategyResolver: { resolve: vi.fn(() => ({ getMessage: () => ({ text: 'Hello' }) })) } as never,
      channelStrategyResolver: { resolve: vi.fn(() => ({ send })) } as never,
    });

    expect(send).toHaveBeenCalledWith({ telegramId: '123', message: { text: 'Hello' }, extra: null });
    expect(result).toMatchObject({ id: '1', status: NotificationStatus.Sent });
  });
});
