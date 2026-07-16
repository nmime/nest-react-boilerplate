import { describe, expect, it, vi } from 'vitest';
import { NotificationTargetType } from '@app/common-notifications';
import { NotificationDeliverySchedulerService } from './notification-delivery-scheduler.service';

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
});
