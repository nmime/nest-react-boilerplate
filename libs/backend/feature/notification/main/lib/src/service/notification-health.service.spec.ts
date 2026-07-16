import { describe, expect, it, vi } from 'vitest';
import { NotificationHealthService } from './notification-health.service';

function createService(result: number | Error | string, responsibleTag = '@platform') {
  const countRecentDeliveryErrors =
    result instanceof Error || typeof result === 'string'
      ? vi.fn().mockRejectedValue(result)
      : vi.fn().mockResolvedValue(result);
  const service = new NotificationHealthService(
    { countRecentDeliveryErrors } as never,
    { alertIntervalMinutes: 15, errorThreshold: 2, responsibleTag } as never,
  );
  return { service, countRecentDeliveryErrors };
}

describe(NotificationHealthService.name, () => {
  it('reports healthy delivery at or below the configured threshold', async () => {
    const { service, countRecentDeliveryErrors } = createService(2);

    await expect(service.checkPushNotificationDelivery()).resolves.toEqual({
      healthy: true,
      message: 'Notification delivery is stable',
    });
    expect(countRecentDeliveryErrors).toHaveBeenCalledWith({ fromDate: expect.any(Date), limit: 3 });
  });

  it('reports unhealthy delivery with operational context and ownership', async () => {
    const { service } = createService(4);

    await expect(service.checkPushNotificationDelivery()).resolves.toEqual({
      healthy: false,
      message: 'Push notification delivery failures detected (@platform)',
      systemErrorsCount: 4,
      timeWindow: '15 minutes',
      threshold: 2,
    });
  });

  it('omits empty ownership from delivery alerts', async () => {
    const { service } = createService(4, '');

    await expect(service.checkPushNotificationDelivery()).resolves.toMatchObject({
      message: 'Push notification delivery failures detected',
    });
  });

  it.each([new Error('database unavailable'), 'database unavailable'])(
    'converts persistence failure %p into an unhealthy result',
    async (error) => {
      const { service } = createService(error);

      await expect(service.checkPushNotificationDelivery()).resolves.toEqual({
        healthy: false,
        message: 'Failed to check push notification health (@platform)',
      });
    },
  );
});
