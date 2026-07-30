// @requirements REQ-NOTIFY-PERSISTENCE-005
import { describe, expect, it, vi } from 'vitest';
import { NotificationConsumerService } from './notification-consumer.service';

describe(NotificationConsumerService.name, () => {
  it('stops intake and drains the active iteration before application shutdown', async () => {
    const claimStarted = deferred<void>();
    const uploadClaim = deferred<null>();
    const persistence = {
      claimSegmentUpload: vi.fn(async () => {
        claimStarted.resolve();
        return uploadClaim.promise;
      }),
      claimSnapshot: vi.fn().mockResolvedValue(null),
      materializeNextBroadcastChunk: vi.fn().mockResolvedValue(0),
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
    expect(persistence.materializeNextBroadcastChunk).toHaveBeenCalledWith(100);
  });
});

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
