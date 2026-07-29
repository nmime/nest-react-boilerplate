import { describe, expect, it, vi } from 'vitest';
import { NotificationConsumerService } from './notification-consumer.service';

describe(NotificationConsumerService.name, () => {
  it('stops intake and drains the active iteration before application shutdown', async () => {
    const claimStarted = Promise.withResolvers<void>();
    const uploadClaim = Promise.withResolvers<null>();
    const persistence = {
      claimSegmentUpload: vi.fn(async () => {
        claimStarted.resolve();
        return uploadClaim.promise;
      }),
      claimSnapshot: vi.fn().mockResolvedValue(null),
      claimBroadcastMaterialization: vi.fn().mockResolvedValue(null),
    };
    const service = new NotificationConsumerService(
      {
        broadcasts: {
          consumerIntervalMs: 1_000,
          materializationChunkSize: 100,
          csvMaxBytes: 1_024,
          csvMaxRows: 100,
        },
      } as never,
      persistence as never,
      {} as never,
      {} as never,
      {} as never,
    );

    service.onApplicationBootstrap();
    await claimStarted.promise;
    const shutdown = service.beforeApplicationShutdown();
    let shutdownComplete = false;
    void shutdown.then(() => {
      shutdownComplete = true;
    });
    await Promise.resolve();
    expect(shutdownComplete).toBe(false);

    uploadClaim.resolve(null);
    await shutdown;

    expect(shutdownComplete).toBe(true);
    expect(persistence.claimSegmentUpload).toHaveBeenCalledOnce();
    expect(persistence.claimSnapshot).toHaveBeenCalledOnce();
    expect(persistence.claimBroadcastMaterialization).toHaveBeenCalledOnce();
  });
});
