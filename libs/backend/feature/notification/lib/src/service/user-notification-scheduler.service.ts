import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EntityManager } from '@mikro-orm/core';
import {
  NotificationDeliveryRepository,
  NotificationRepository,
  NotificationTargetType,
  type NotificationEntity,
} from '@app/backend-postgres-main-notification';
import { NotificationConfigService } from '../config/notification-config.service';
import { NotificationStrategyResolverService } from './notification-strategy-resolver.service';
import { ChannelStrategyResolver } from '../strategy/transport';
import { MessageStrategyResolver } from '../messages';

@Injectable()
export class UserNotificationSchedulerService {
  private readonly logger = new Logger(UserNotificationSchedulerService.name);
  private readonly usersPerIteration: number;
  private readonly requestsPerSecond: number;
  private isRunning = false;

  constructor(
    private readonly notificationsConfigService: NotificationConfigService,
    private readonly notificationRepository: NotificationRepository,
    private readonly notificationStrategyResolverService: NotificationStrategyResolverService,
    private readonly notificationDeliveryRepository: NotificationDeliveryRepository,
    private readonly channelStrategyResolver: ChannelStrategyResolver,
    private readonly messageStrategyResolver: MessageStrategyResolver,
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {
    this.usersPerIteration = this.notificationsConfigService.send.userPerIteration;
    this.requestsPerSecond = this.notificationsConfigService.send.requestsPerSecond;
  }

  init(): void {
    this.logger.log('UserNotificationScheduler initialized');
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async run(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('Already running, skipping');
      return;
    }

    try {
      this.isRunning = true;
      const { handledCount } = await this.runIteration();
      if (!handledCount) {
        this.logger.log('No pending notifications to process');
      } else {
        this.logger.log(`Processed ${handledCount} notifications`);
      }
    } catch (error) {
      this.logger.error('Error on sending notifications', error instanceof Error ? error.stack : String(error));
    } finally {
      this.isRunning = false;
    }
  }

  async saveProcessed(notifications: NotificationEntity[]): Promise<void> {
    try {
      await this.entityManager.transactional(async (em) => {
        await em.flush();
        const ids = notifications.filter((n) => n.id).map((n) => n.id as string);
        if (ids.length) {
          await this.notificationDeliveryRepository.applyStatusFromNotifications(ids);
        }
      });
    } catch (error) {
      this.logger.error('Failed to persist notification statuses', error instanceof Error ? error.message : String(error));
    }
  }

  private async runIteration(): Promise<{ handledCount: number }> {
    const pendingNotifications = await this.notificationRepository.findPending({
      targetType: NotificationTargetType.User,
      count: this.usersPerIteration,
    });

    if (!pendingNotifications.length) {
      return { handledCount: 0 };
    }

    for (const chunk of this.chunk(pendingNotifications, this.requestsPerSecond)) {
      const startTimestamp = Date.now();
      await Promise.all(chunk.map(async (notification) => this.handleNotification(notification)));
      const duration = Date.now() - startTimestamp;
      if (duration < 1000) {
        await this.sleep(1000 - duration);
      }
    }

    await this.saveProcessed(pendingNotifications);
    return { handledCount: pendingNotifications.length };
  }

  private async handleNotification(notification: NotificationEntity): Promise<void> {
    const strategy = this.notificationStrategyResolverService.resolve(notification.targetType);
    if (!strategy) {
      this.logger.warn(`No strategy for target type: ${notification.targetType}`);
      return;
    }

    await strategy.handleNotification({
      notification,
      channelStrategyResolver: this.channelStrategyResolver,
      messageStrategyResolver: this.messageStrategyResolver,
    });
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
