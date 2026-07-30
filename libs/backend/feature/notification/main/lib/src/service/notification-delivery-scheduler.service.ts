import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationPersistence, NotificationRecipientResolver } from '@app/backend-feature-notification-shared';
import {
  NotificationErrorReason,
  NotificationStatus,
  NotificationTargetType,
  type NotificationDeliveryResult,
  type PendingNotificationDelivery,
} from '@app/common-notifications';
import { MessageStrategyResolver } from '../messages';
import { NotificationProviderResolver } from '../strategy/transport';
import { NotificationConfigService } from '../config/notification-config.service';
import { NotificationRecipientLookupError } from './notification-recipient-resolver.service';
import { NotificationStrategyResolverService } from './notification-strategy-resolver.service';

@Injectable()
export class NotificationDeliverySchedulerService {
  private readonly logger = new Logger(NotificationDeliverySchedulerService.name);
  private readonly deliveriesPerIteration: number;
  private readonly requestsPerSecond: number;
  private readonly deliveryAttemptTimeoutMs: number;
  private isRunning = false;

  constructor(
    notificationConfig: NotificationConfigService,
    private readonly notificationPersistence: NotificationPersistence,
    private readonly targetStrategyResolver: NotificationStrategyResolverService,
    private readonly notificationProviderResolver: NotificationProviderResolver,
    private readonly messageStrategyResolver: MessageStrategyResolver,
    private readonly recipientResolver: NotificationRecipientResolver,
  ) {
    this.deliveriesPerIteration = notificationConfig.send.deliveriesPerIteration;
    this.requestsPerSecond = notificationConfig.send.requestsPerSecond;
    this.deliveryAttemptTimeoutMs = Math.max(1, Math.min(notificationConfig.send.timeouts.idleTimeout, 60_000));
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async run(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    try {
      const handledCount = await this.runIteration();
      this.logger.debug(`Processed ${handledCount} notification deliveries`);
    } catch (error) {
      this.logger.error('Notification delivery iteration failed', error instanceof Error ? error.stack : error);
    } finally {
      this.isRunning = false;
    }
  }

  async runIteration(): Promise<number> {
    const now = new Date();
    const targetTypes = Object.values(NotificationTargetType);
    const baseTargetLimit = Math.floor(this.deliveriesPerIteration / targetTypes.length);
    const targetLimitRemainder = this.deliveriesPerIteration % targetTypes.length;
    const claims = await Promise.all(
      targetTypes.map((targetType, index) => {
        const count = baseTargetLimit + (index < targetLimitRemainder ? 1 : 0);
        return count > 0
          ? this.notificationPersistence.claimPendingDeliveries({ targetType, count, now })
          : Promise.resolve(null);
      }),
    );
    const pending = claims.flatMap((claim) =>
      claim ? claim.deliveries.map((delivery) => ({ claimToken: claim.claimToken, delivery })) : [],
    );
    let handled = 0;

    for (const chunk of this.chunk(pending, this.requestsPerSecond)) {
      const startedAt = Date.now();
      // Chunks are sequential so ownership is renewed immediately before each provider batch.
      // eslint-disable-next-line no-await-in-loop
      const ownedTokens = await this.renewClaims(chunk);
      const ownedChunk = chunk.filter((item) => ownedTokens.has(item.claimToken));
      if (ownedChunk.length === 0) {
        continue;
      }
      // Chunks are intentionally sequential to enforce the configured per-second rate limit.
      // eslint-disable-next-line no-await-in-loop
      const results = await Promise.all(ownedChunk.map((item) => this.handleWithDeadline(item)));
      const resultsByClaim = new Map<string, NotificationDeliveryResult[]>();
      for (let index = 0; index < ownedChunk.length; index += 1) {
        const item = ownedChunk[index];
        const execution = results[index];
        if (!item || !execution?.result) {
          continue;
        }
        handled += 1;
        if (this.shouldQuarantineUnknownOutcome(item.delivery, execution)) {
          this.logger.error(
            `Notification delivery ${item.delivery.delivery.id} has an unknown non-idempotent provider outcome; automatic retry is quarantined.`,
          );
          continue;
        }
        const claimResults = resultsByClaim.get(item.claimToken) ?? [];
        claimResults.push(execution.result);
        resultsByClaim.set(item.claimToken, claimResults);
      }
      for (const [claimToken, claimResults] of resultsByClaim) {
        // Result groups are intentionally sequential to keep transactional writes deterministic.
        // eslint-disable-next-line no-await-in-loop
        await this.notificationPersistence.saveClaimedDeliveryResults(claimResults, claimToken);
      }
      const duration = Date.now() - startedAt;
      if (duration < 1000) {
        // eslint-disable-next-line no-await-in-loop
        await this.sleep(1000 - duration);
      }
    }
    return handled;
  }

  private async renewClaims(
    chunk: Array<{ claimToken: string; delivery: PendingNotificationDelivery }>,
  ): Promise<Set<string>> {
    const tokens = [...new Set(chunk.map((item) => item.claimToken))];
    const renewed = await Promise.all(
      tokens.map(async (claimToken) => ({
        claimToken,
        owned: await this.notificationPersistence.renewDeliveryClaim(claimToken, new Date()),
      })),
    );
    return new Set(renewed.filter(({ owned }) => owned).map(({ claimToken }) => claimToken));
  }

  private async handleWithDeadline(item: {
    claimToken: string;
    delivery: PendingNotificationDelivery;
  }): Promise<DeliveryExecution> {
    const pending = item.delivery;
    const controller = new AbortController();
    let dispatchStarted = false;
    let timeout: NodeJS.Timeout | undefined;
    const timedOut = new Promise<DeliveryExecution>((resolve) => {
      timeout = setTimeout(() => {
        resolve({
          dispatchStarted,
          result: {
            id: pending.delivery.id,
            createdAt: pending.delivery.createdAt,
            claimToken: pending.claimToken,
            status: NotificationStatus.Pending,
            error: {
              reason: NotificationErrorReason.NetworkError,
              message: 'Notification delivery attempt timed out.',
            },
          },
        });
        controller.abort(new Error('Notification delivery attempt timed out.'));
      }, this.deliveryAttemptTimeoutMs);
      timeout.unref();
    });

    try {
      const handled = this.handle(pending, controller.signal, async () => {
        const started = await this.notificationPersistence.beginClaimedDeliveryAttempts(
          [{ id: pending.delivery.id, createdAt: pending.delivery.createdAt }],
          item.claimToken,
          new Date(),
        );
        if (started.length === 0) {
          throw new NotificationDeliveryClaimLostError();
        }
        dispatchStarted = true;
      }).then(
        (result): DeliveryExecution => ({ dispatchStarted, result }),
        (error): DeliveryExecution => {
          if (error instanceof NotificationDeliveryClaimLostError) {
            return { dispatchStarted: false, result: null };
          }
          if (error instanceof Error) {
            throw error;
          }
          throw new Error('Notification delivery failed.', { cause: error });
        },
      );
      return await Promise.race([handled, timedOut]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private async handle(
    pending: PendingNotificationDelivery,
    signal: AbortSignal,
    beforeProviderDispatch: () => Promise<void>,
  ): Promise<NotificationDeliveryResult> {
    const strategy = this.targetStrategyResolver.resolve(pending.notification.targetType);
    if (!strategy) {
      return {
        id: pending.delivery.id,
        createdAt: pending.delivery.createdAt,
        claimToken: pending.claimToken,
        status: NotificationStatus.Error,
        error: { reason: NotificationErrorReason.NotFoundTargetStrategy },
      };
    }
    try {
      return await strategy.handleNotification({
        pending,
        notificationProviderResolver: this.notificationProviderResolver,
        messageStrategyResolver: this.messageStrategyResolver,
        recipientResolver: this.recipientResolver,
        signal,
        beforeProviderDispatch,
      });
    } catch (error) {
      if (error instanceof NotificationRecipientLookupError) {
        // Transient recipient-lookup failure: keep the delivery Pending so it is retried
        // (with backoff) instead of aborting the whole chunk and re-sending its siblings.
        this.logger.warn(`${error.message}; rescheduling delivery ${pending.delivery.id}`);
        return {
          id: pending.delivery.id,
          createdAt: pending.delivery.createdAt,
          claimToken: pending.claimToken,
          status: NotificationStatus.Pending,
          error: { reason: NotificationErrorReason.NetworkError, message: error.message },
        };
      }
      throw error;
    }
  }

  private shouldQuarantineUnknownOutcome(pending: PendingNotificationDelivery, execution: DeliveryExecution): boolean {
    return (
      execution.dispatchStarted &&
      execution.result?.status === NotificationStatus.Pending &&
      execution.result.error?.reason === NotificationErrorReason.NetworkError &&
      !this.notificationProviderResolver.supportsIdempotentRetry(pending.delivery.provider)
    );
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}

interface DeliveryExecution {
  dispatchStarted: boolean;
  result: NotificationDeliveryResult | null;
}

class NotificationDeliveryClaimLostError extends Error {}
