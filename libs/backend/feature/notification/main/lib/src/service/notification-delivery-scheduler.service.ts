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
import { ChannelStrategyResolver } from '../strategy/transport';
import { NotificationConfigService } from '../config/notification-config.service';
import { NotificationRecipientLookupError } from './notification-recipient-resolver.service';
import { NotificationStrategyResolverService } from './notification-strategy-resolver.service';

@Injectable()
export class NotificationDeliverySchedulerService {
  private readonly logger = new Logger(NotificationDeliverySchedulerService.name);
  private readonly deliveriesPerIteration: number;
  private readonly requestsPerSecond: number;
  private isRunning = false;

  constructor(
    notificationConfig: NotificationConfigService,
    private readonly notificationPersistence: NotificationPersistence,
    private readonly targetStrategyResolver: NotificationStrategyResolverService,
    private readonly channelStrategyResolver: ChannelStrategyResolver,
    private readonly messageStrategyResolver: MessageStrategyResolver,
    private readonly recipientResolver: NotificationRecipientResolver,
  ) {
    this.deliveriesPerIteration = notificationConfig.send.deliveriesPerIteration;
    this.requestsPerSecond = notificationConfig.send.requestsPerSecond;
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
    const perTargetLimit = Math.max(1, Math.ceil(this.deliveriesPerIteration / targetTypes.length));
    const pendingGroups = await Promise.all(
      targetTypes.map((targetType) =>
        this.notificationPersistence.findPendingDeliveries({
          targetType,
          count: perTargetLimit,
          now,
        }),
      ),
    );
    const pending = pendingGroups.flat().slice(0, this.deliveriesPerIteration);

    for (const chunk of this.chunk(pending, this.requestsPerSecond)) {
      const startedAt = Date.now();
      // Chunks are intentionally sequential to enforce the configured per-second rate limit.
      // eslint-disable-next-line no-await-in-loop
      const results = await Promise.all(chunk.map((item) => this.handle(item)));
      // eslint-disable-next-line no-await-in-loop
      await this.notificationPersistence.saveDeliveryResults(results);
      const duration = Date.now() - startedAt;
      if (duration < 1000) {
        // eslint-disable-next-line no-await-in-loop
        await this.sleep(1000 - duration);
      }
    }
    return pending.length;
  }

  private async handle(pending: PendingNotificationDelivery): Promise<NotificationDeliveryResult> {
    const strategy = this.targetStrategyResolver.resolve(pending.notification.targetType);
    if (!strategy) {
      return {
        id: pending.delivery.id,
        createdAt: pending.delivery.createdAt,
        status: NotificationStatus.Error,
        error: { reason: NotificationErrorReason.NotFoundTargetStrategy },
      };
    }
    try {
      return await strategy.handleNotification({
        pending,
        channelStrategyResolver: this.channelStrategyResolver,
        messageStrategyResolver: this.messageStrategyResolver,
        recipientResolver: this.recipientResolver,
      });
    } catch (error) {
      if (error instanceof NotificationRecipientLookupError) {
        // Transient recipient-lookup failure: keep the delivery Pending so it is retried
        // (with backoff) instead of aborting the whole chunk and re-sending its siblings.
        this.logger.warn(`${error.message}; rescheduling delivery ${pending.delivery.id}`);
        return {
          id: pending.delivery.id,
          createdAt: pending.delivery.createdAt,
          status: NotificationStatus.Pending,
          error: { reason: NotificationErrorReason.NetworkError, message: error.message },
        };
      }
      throw error;
    }
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
