// @requirements REQ-NOTIFY-PERSISTENCE-005
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotificationDeliveryPartitionService } from './notification-delivery-partition.service';

describe(NotificationDeliveryPartitionService.name, () => {
  it.each([
    [0, 1],
    [4, 4],
    [99, 24],
  ])('clamps %s configured months to %s and delegates maintenance', async (configured, expected) => {
    const maintenance = { ensurePartitions: vi.fn().mockResolvedValue(undefined) };
    const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    const service = new NotificationDeliveryPartitionService(
      maintenance as never,
      { deliveriesPartitionAheadMonths: configured } as never,
    );

    await service.ensurePartitions();

    expect(maintenance.ensurePartitions).toHaveBeenCalledWith(expected);
    expect(debug).toHaveBeenCalledWith(`Notification delivery partitions ensured ${expected} months ahead`);
    debug.mockRestore();
  });

  it('runs the same maintenance during module initialization and propagates failure', async () => {
    const failure = new Error('partition creation failed');
    const maintenance = { ensurePartitions: vi.fn().mockRejectedValue(failure) };
    const service = new NotificationDeliveryPartitionService(
      maintenance as never,
      { deliveriesPartitionAheadMonths: 3 } as never,
    );

    await expect(service.onModuleInit()).rejects.toBe(failure);
    expect(maintenance.ensurePartitions).toHaveBeenCalledOnce();
  });
});
