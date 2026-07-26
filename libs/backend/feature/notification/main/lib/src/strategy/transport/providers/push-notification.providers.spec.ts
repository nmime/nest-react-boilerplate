// @requirements REQ-NOTIFY-TEMPLATE-003
import { describe, expect, it } from 'vitest';
import { NotificationErrorReason, NotificationStatus } from '@app/common-notifications';
import { AppleApnsNotificationProvider } from './apple-apns-notification.provider';
import { GoogleFcmNotificationProvider } from './google-fcm-notification.provider';

describe('push notification providers', () => {
  it.each([
    ['FCM', new GoogleFcmNotificationProvider({ googleFcm: {} } as never)],
    ['APNs', new AppleApnsNotificationProvider({ appleApns: {} } as never)],
  ])('%s fails closed when credentials are missing', async (_label, provider) => {
    await expect(
      provider.send({
        address: 'a'.repeat(64),
        deliveryId: 'delivery-1',
        message: { kind: 'push', subject: 'Hello', text: 'World' },
      }),
    ).resolves.toMatchObject({
      status: NotificationStatus.Error,
      errorReason: NotificationErrorReason.ProviderConfiguration,
    });
  });

  it.each([
    ['FCM', new GoogleFcmNotificationProvider({ googleFcm: {} } as never)],
    ['APNs', new AppleApnsNotificationProvider({ appleApns: {} } as never)],
  ])('%s rejects non-push messages', async (_label, provider) => {
    await expect(
      provider.send({ address: 'target', deliveryId: 'delivery-2', message: { kind: 'bot', text: 'Wrong' } }),
    ).resolves.toMatchObject({
      status: NotificationStatus.Error,
      errorReason: NotificationErrorReason.UnsupportedChannel,
    });
  });
});
