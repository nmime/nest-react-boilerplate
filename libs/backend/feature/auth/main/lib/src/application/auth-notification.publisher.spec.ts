// @requirements REQ-AUTH-ACCESS-001
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationChannel, NotificationDeliveryProvider, NotificationTargetType } from '@app/common-notifications';
import { AuthNotificationPublisher } from './auth-notification.publisher';

describe(AuthNotificationPublisher.name, () => {
  afterEach(() => {
    delete process.env.AUTH_NOTIFICATION_PROVIDER;
  });

  it('publishes a password-reset code through the configured bot provider without putting the code in ordinary data', async () => {
    process.env.AUTH_NOTIFICATION_PROVIDER = 'telegram-bot';
    const notifications = { upsertTemplate: vi.fn(), createTemplateNotification: vi.fn() };
    const publisher = new AuthNotificationPublisher(notifications as never);

    await publisher.publishUserAction({ userId: 'user-1', purpose: 'password_reset', token: 'secret-code' });

    expect(notifications.createTemplateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: NotificationTargetType.User,
        targetId: 'user-1',
        deliveries: [{ channel: NotificationChannel.Bot, provider: NotificationDeliveryProvider.TelegramBot }],
        sensitiveData: { code: 'secret-code' },
        inAppVisible: false,
      }),
    );
  });
});
