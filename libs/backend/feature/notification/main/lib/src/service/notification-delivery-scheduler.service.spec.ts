import { describe, expect, it, vi } from 'vitest';
import { NotificationErrorReason, NotificationStatus, NotificationTargetType } from '@app/common-notifications';
import { NotificationDeliverySchedulerService } from './notification-delivery-scheduler.service';
import { NotificationRecipientLookupError } from './notification-recipient-resolver.service';

describe(NotificationDeliverySchedulerService.name, () => {
  it('queries every target type and does not mutate notification events', async () => {
    const findPendingDeliveries = vi.fn().mockResolvedValue([]);
    const service = new NotificationDeliverySchedulerService(
      { send: { deliveriesPerIteration: 30, requestsPerSecond: 30 } } as never,
      { findPendingDeliveries, saveDeliveryResults: vi.fn() } as never,
      { resolve: vi.fn() } as never,
      { resolve: vi.fn() } as never,
      { resolve: vi.fn() } as never,
      { resolve: vi.fn() } as never,
    );

    await expect(service.runIteration()).resolves.toBe(0);
    expect(findPendingDeliveries).toHaveBeenCalledTimes(Object.values(NotificationTargetType).length);
  });

  it('chunks work by the configured request rate', () => {
    const service = new NotificationDeliverySchedulerService(
      { send: { deliveriesPerIteration: 30, requestsPerSecond: 2 } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(service['chunk']([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('reschedules a delivery as Pending when recipient lookup fails transiently, without aborting the chunk', async () => {
    const pending = {
      delivery: { id: 'd1', createdAt: new Date('2026-07-20T00:00:00.000Z') },
      notification: { targetType: NotificationTargetType.User },
    };
    const findPendingDeliveries = vi.fn().mockResolvedValueOnce([pending]).mockResolvedValue([]);
    const saveDeliveryResults = vi.fn().mockResolvedValue(undefined);
    const handleNotification = vi
      .fn()
      .mockRejectedValue(new NotificationRecipientLookupError(NotificationTargetType.User, 'user-1', 'db unavailable'));
    const service = new NotificationDeliverySchedulerService(
      { send: { deliveriesPerIteration: 30, requestsPerSecond: 30 } } as never,
      { findPendingDeliveries, saveDeliveryResults } as never,
      { resolve: () => ({ handleNotification }) } as never,
      { resolve: vi.fn() } as never,
      { resolve: vi.fn() } as never,
      { resolve: vi.fn() } as never,
    );
    service['sleep'] = () => Promise.resolve();

    await expect(service.runIteration()).resolves.toBe(1);
    expect(saveDeliveryResults).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'd1',
        status: NotificationStatus.Pending,
        error: expect.objectContaining({ reason: NotificationErrorReason.NetworkError }),
      }),
    ]);
  });
});
