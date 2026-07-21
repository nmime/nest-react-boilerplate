import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationChannel, NotificationDeliveryProvider, NotificationTargetType } from '@app/common-notifications';
import { AuthNotificationPublisher } from './auth-notification.publisher';

describe(AuthNotificationPublisher.name, () => {
  afterEach(() => {
    delete process.env.AUTH_NOTIFICATION_PROVIDER;
    delete process.env.NOTIFICATION_EMAIL_PROVIDER;
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

  it('uses the selected email provider for Better Auth bearer links', async () => {
    process.env.NOTIFICATION_EMAIL_PROVIDER = 'mailpace';
    const notifications = { upsertTemplate: vi.fn(), createTemplateNotification: vi.fn() };
    const publisher = new AuthNotificationPublisher(notifications as never);

    await publisher.publishBetterAuthLink({
      email: 'USER@example.com',
      purpose: 'email_verification',
      actionUrl: 'https://example.com/verify?token=secret',
    });

    expect(notifications.createTemplateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: NotificationTargetType.Email,
        targetId: 'user@example.com',
        deliveries: [{ channel: NotificationChannel.Email, provider: NotificationDeliveryProvider.MailPace }],
        sensitiveData: { actionUrl: 'https://example.com/verify?token=secret' },
      }),
    );
  });
});
