// @requirements REQ-NOTIFY-DELIVERY-001
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationDeliveryProvider } from '@app/common-notifications';
import { NotificationProviderReadinessService } from './notification-provider-readiness.service';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe(NotificationProviderReadinessService.name, () => {
  it('reports the selected email provider as a required health dependency', () => {
    const service = readinessService([
      { provider: NotificationDeliveryProvider.Resend, configured: false },
      { provider: NotificationDeliveryProvider.MailPace, configured: true },
    ]);

    expect(service.check()).toMatchObject({
      name: 'notification-providers',
      required: true,
      status: 'error',
      details: {
        providers: expect.arrayContaining([
          { provider: NotificationDeliveryProvider.Resend, configured: false, required: true },
          { provider: NotificationDeliveryProvider.MailPace, configured: true, required: false },
        ]),
      },
    });
  });

  it('includes an explicitly selected auth provider in production startup requirements', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_NOTIFICATION_PROVIDER', NotificationDeliveryProvider.TelegramBot);
    const service = readinessService([
      { provider: NotificationDeliveryProvider.Resend, configured: true },
      { provider: NotificationDeliveryProvider.TelegramBot, configured: false },
    ]);

    expect(() => {
      service.onApplicationBootstrap();
    }).toThrow('Notification scheduler requires configured providers: telegram-bot.');
  });

  it('starts when every required provider is configured', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const service = readinessService([{ provider: NotificationDeliveryProvider.Resend, configured: true }]);

    expect(() => {
      service.onApplicationBootstrap();
    }).not.toThrow();
    expect(service.check().status).toBe('ok');
  });
});

function readinessService(readiness: Array<{ provider: NotificationDeliveryProvider; configured: boolean }>) {
  return new NotificationProviderReadinessService(
    { readiness: () => readiness } as never,
    { emailProvider: NotificationDeliveryProvider.Resend } as never,
  );
}
