// @requirements REQ-NOTIFY-PERSISTENCE-005
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NotificationDeliveryProvider,
  NotificationErrorReason,
  NotificationStatus,
  NotificationTargetType,
} from '@app/common-notifications';
import type { HandleNotificationParams } from '../strategy/target/base-notification.strategy';
import { GoogleFcmNotificationProvider } from '../strategy/transport/providers/google-fcm-notification.provider';
import { NotificationDeliverySchedulerService } from './notification-delivery-scheduler.service';
import { NotificationRecipientLookupError } from './notification-recipient-resolver.service';

const fcmPrivateKey = generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ format: 'pem', type: 'pkcs8' })
  .toString();

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe(NotificationDeliverySchedulerService.name, () => {
  it('queries every target type and does not mutate notification events', async () => {
    const claimPendingDeliveries = vi.fn().mockResolvedValue(null);
    const service = createService({ claimPendingDeliveries });

    await expect(service.runIteration()).resolves.toBe(0);
    expect(claimPendingDeliveries).toHaveBeenCalledTimes(Object.values(NotificationTargetType).length);
  });

  it('does not claim more deliveries than the iteration limit', async () => {
    const claimPendingDeliveries = vi.fn().mockResolvedValue(null);
    const service = createService({ claimPendingDeliveries }, { deliveriesPerIteration: 31 });

    await service.runIteration();

    const claimedCount = claimPendingDeliveries.mock.calls.reduce<number>((total, call) => {
      const [params] = call as [{ count: number }];
      return total + params.count;
    }, 0);
    expect(claimedCount).toBe(31);
  });

  it('chunks work by the configured request rate', () => {
    const service = createService({}, { requestsPerSecond: 2 });
    expect(service['chunk']([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('saves a pre-dispatch recipient failure without marking provider I/O as started', async () => {
    const pending = pendingDelivery();
    const claimPendingDeliveries = vi.fn().mockResolvedValueOnce(claim('claim-a', pending)).mockResolvedValue(null);
    const renewDeliveryClaim = vi.fn().mockResolvedValue(true);
    const beginClaimedDeliveryAttempts = vi.fn((deliveries: unknown[]) => Promise.resolve(deliveries));
    const saveClaimedDeliveryResults = vi.fn().mockResolvedValue(undefined);
    const handleNotification = vi
      .fn()
      .mockRejectedValue(new NotificationRecipientLookupError(NotificationTargetType.User, 'user-1', 'db unavailable'));
    const service = createService(
      { claimPendingDeliveries, renewDeliveryClaim, beginClaimedDeliveryAttempts, saveClaimedDeliveryResults },
      {},
      handleNotification,
    );
    service['sleep'] = () => Promise.resolve();

    await expect(service.runIteration()).resolves.toBe(1);
    expect(renewDeliveryClaim).toHaveBeenCalledWith('claim-a', expect.any(Date));
    expect(beginClaimedDeliveryAttempts).not.toHaveBeenCalled();
    expect(saveClaimedDeliveryResults).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'd1',
          claimToken: 'claim-a',
          status: NotificationStatus.Pending,
          error: expect.objectContaining({ reason: NotificationErrorReason.NetworkError }),
        }),
      ],
      'claim-a',
    );
  });

  it('does not dispatch after ownership renewal reports that the claim was lost', async () => {
    const pending = pendingDelivery();
    const handleNotification = vi.fn();
    const saveClaimedDeliveryResults = vi.fn();
    const service = createService(
      {
        claimPendingDeliveries: vi.fn().mockResolvedValueOnce(claim('old-claim', pending)).mockResolvedValue(null),
        renewDeliveryClaim: vi.fn().mockResolvedValue(false),
        saveClaimedDeliveryResults,
      },
      {},
      handleNotification,
    );

    await expect(service.runIteration()).resolves.toBe(0);
    expect(handleNotification).not.toHaveBeenCalled();
    expect(saveClaimedDeliveryResults).not.toHaveBeenCalled();
  });

  it('does not dispatch when ownership is lost immediately before provider I/O', async () => {
    const pending = pendingDelivery();
    const handleNotification = vi.fn(
      async ({ beforeProviderDispatch }: { beforeProviderDispatch: () => Promise<void> }) => {
        await beforeProviderDispatch();
        return {
          id: 'd1',
          createdAt: pending.delivery.createdAt,
          claimToken: 'old-claim',
          status: NotificationStatus.Sent,
        };
      },
    );
    const saveClaimedDeliveryResults = vi.fn();
    const service = createService(
      {
        claimPendingDeliveries: vi.fn().mockResolvedValueOnce(claim('old-claim', pending)).mockResolvedValue(null),
        renewDeliveryClaim: vi.fn().mockResolvedValue(true),
        beginClaimedDeliveryAttempts: vi.fn().mockResolvedValue([]),
        saveClaimedDeliveryResults,
      },
      {},
      handleNotification,
    );
    service['sleep'] = () => Promise.resolve();

    await expect(service.runIteration()).resolves.toBe(0);
    expect(handleNotification).toHaveBeenCalledOnce();
    expect(saveClaimedDeliveryResults).not.toHaveBeenCalled();
  });

  it('keeps a transient FCM OAuth failure retry eligible without marking message dispatch', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('OAuth endpoint unavailable'));
    vi.stubGlobal('fetch', fetch);
    const pending = pendingDelivery();
    const beginClaimedDeliveryAttempts = vi.fn((deliveries: unknown[]) => Promise.resolve(deliveries));
    const saveClaimedDeliveryResults = vi.fn().mockResolvedValue(undefined);
    const service = createService(
      {
        claimPendingDeliveries: vi.fn().mockResolvedValueOnce(claim('claim-a', pending)).mockResolvedValue(null),
        renewDeliveryClaim: vi.fn().mockResolvedValue(true),
        beginClaimedDeliveryAttempts,
        saveClaimedDeliveryResults,
      },
      {},
      fcmHandleNotification(pending),
    );
    service['sleep'] = () => Promise.resolve();

    await expect(service.runIteration()).resolves.toBe(1);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('https://oauth.example.test/token', expect.any(Object));
    expect(beginClaimedDeliveryAttempts).not.toHaveBeenCalled();
    expect(saveClaimedDeliveryResults).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: 'd1',
          claimToken: 'claim-a',
          status: NotificationStatus.Pending,
          error: expect.objectContaining({ reason: NotificationErrorReason.NetworkError }),
        }),
      ],
      'claim-a',
    );
  });

  it('quarantines an unknown FCM outcome after the message-post request starts', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'access-token', expires_in: 3600 }), { status: 200 }),
      )
      .mockRejectedValueOnce(new TypeError('Message endpoint connection closed'));
    vi.stubGlobal('fetch', fetch);
    const pending = pendingDelivery();
    const beginClaimedDeliveryAttempts = vi.fn((deliveries: unknown[]) => Promise.resolve(deliveries));
    const saveClaimedDeliveryResults = vi.fn().mockResolvedValue(undefined);
    const service = createService(
      {
        claimPendingDeliveries: vi.fn().mockResolvedValueOnce(claim('claim-a', pending)).mockResolvedValue(null),
        renewDeliveryClaim: vi.fn().mockResolvedValue(true),
        beginClaimedDeliveryAttempts,
        saveClaimedDeliveryResults,
      },
      {},
      fcmHandleNotification(pending),
    );
    service['sleep'] = () => Promise.resolve();

    await expect(service.runIteration()).resolves.toBe(1);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[0]).toBe('https://fcm.googleapis.com/v1/projects/test-project/messages:send');
    expect(beginClaimedDeliveryAttempts).toHaveBeenCalledWith(
      [{ id: 'd1', createdAt: pending.delivery.createdAt }],
      'claim-a',
      expect.any(Date),
    );
    expect(saveClaimedDeliveryResults).not.toHaveBeenCalled();
  });

  it('aborts and quarantines a timed-out non-idempotent provider attempt', async () => {
    vi.useFakeTimers();
    const pending = pendingDelivery();
    let observedSignal: AbortSignal | undefined;
    const handleNotification = vi.fn(
      async ({
        signal,
        beforeProviderDispatch,
      }: {
        signal: AbortSignal;
        beforeProviderDispatch: () => Promise<void>;
      }) => {
        await beforeProviderDispatch();
        observedSignal = signal;
        return new Promise(() => undefined);
      },
    );
    const saveClaimedDeliveryResults = vi.fn().mockResolvedValue(undefined);
    const service = createService(
      {
        claimPendingDeliveries: vi.fn().mockResolvedValueOnce(claim('claim-a', pending)).mockResolvedValue(null),
        renewDeliveryClaim: vi.fn().mockResolvedValue(true),
        saveClaimedDeliveryResults,
      },
      { idleTimeout: 100 },
      handleNotification,
    );
    service['sleep'] = () => Promise.resolve();

    const iteration = service.runIteration();
    await vi.advanceTimersByTimeAsync(101);

    await expect(iteration).resolves.toBe(1);
    expect(observedSignal?.aborted).toBe(true);
    expect(saveClaimedDeliveryResults).not.toHaveBeenCalled();
  });

  it('reschedules a timed-out provider attempt when its idempotency key is stable', async () => {
    vi.useFakeTimers();
    const pending = pendingDelivery();
    const handleNotification = vi.fn(
      async ({ beforeProviderDispatch }: { beforeProviderDispatch: () => Promise<void> }) => {
        await beforeProviderDispatch();
        return new Promise(() => undefined);
      },
    );
    const saveClaimedDeliveryResults = vi.fn().mockResolvedValue(undefined);
    const service = createService(
      {
        claimPendingDeliveries: vi.fn().mockResolvedValueOnce(claim('claim-a', pending)).mockResolvedValue(null),
        renewDeliveryClaim: vi.fn().mockResolvedValue(true),
        saveClaimedDeliveryResults,
      },
      { idleTimeout: 100, idempotentRetries: true },
      handleNotification,
    );
    service['sleep'] = () => Promise.resolve();

    const iteration = service.runIteration();
    await vi.advanceTimersByTimeAsync(101);

    await expect(iteration).resolves.toBe(1);
    expect(saveClaimedDeliveryResults).toHaveBeenCalledWith(
      [expect.objectContaining({ claimToken: 'claim-a', status: NotificationStatus.Pending })],
      'claim-a',
    );
  });
});

function createService(
  persistence: Record<string, unknown>,
  config: {
    deliveriesPerIteration?: number;
    requestsPerSecond?: number;
    idleTimeout?: number;
    idempotentRetries?: boolean;
  } = {},
  handleNotification = vi.fn(),
) {
  return new NotificationDeliverySchedulerService(
    {
      send: {
        deliveriesPerIteration: config.deliveriesPerIteration ?? 30,
        requestsPerSecond: config.requestsPerSecond ?? 30,
        timeouts: { idleTimeout: config.idleTimeout ?? 10_000, afterMassSend: 1_000 },
      },
    } as never,
    {
      claimPendingDeliveries: vi.fn().mockResolvedValue(null),
      renewDeliveryClaim: vi.fn().mockResolvedValue(true),
      beginClaimedDeliveryAttempts: vi.fn((deliveries: unknown[]) => Promise.resolve(deliveries)),
      saveClaimedDeliveryResults: vi.fn().mockResolvedValue(undefined),
      ...persistence,
    } as never,
    { resolve: () => ({ handleNotification }) } as never,
    {
      resolve: vi.fn(),
      supportsIdempotentRetry: vi.fn().mockReturnValue(config.idempotentRetries ?? false),
    } as never,
    { resolve: vi.fn() } as never,
    { resolve: vi.fn() } as never,
  );
}

function pendingDelivery() {
  return {
    delivery: {
      id: 'd1',
      createdAt: new Date('2026-07-20T00:00:00.000Z'),
      provider: NotificationDeliveryProvider.GoogleFcm,
    },
    notification: { targetType: NotificationTargetType.User },
  };
}

function fcmHandleNotification(pending: ReturnType<typeof pendingDelivery>) {
  const provider = new GoogleFcmNotificationProvider({
    googleFcm: {
      projectId: 'test-project',
      clientEmail: 'sender@example.test',
      privateKey: fcmPrivateKey,
      tokenUri: 'https://oauth.example.test/token',
    },
  } as never);
  return vi.fn(
    async ({
      pending: claimedPending,
      signal,
      beforeProviderDispatch,
    }: Pick<HandleNotificationParams, 'pending' | 'signal' | 'beforeProviderDispatch'>) => {
      const result = await provider.send({
        address: 'device-token',
        deliveryId: pending.delivery.id,
        markDispatchStarted: beforeProviderDispatch,
        message: { kind: 'push', subject: 'Test', text: 'Message' },
        signal,
      });
      return {
        id: pending.delivery.id,
        createdAt: pending.delivery.createdAt,
        claimToken: claimedPending.claimToken,
        status: result.status,
        error: result.errorReason ? { reason: result.errorReason, message: result.errorMessage } : null,
        retryAfterSeconds: result.retryAfterSeconds,
      };
    },
  );
}

function claim(claimToken: string, pending: ReturnType<typeof pendingDelivery>) {
  const claimedAt = new Date('2026-07-20T00:00:00.000Z');
  return {
    claimToken,
    claimedAt,
    leaseExpiresAt: new Date(claimedAt.getTime() + 300_000),
    deliveries: [{ ...pending, claimToken }],
  };
}
