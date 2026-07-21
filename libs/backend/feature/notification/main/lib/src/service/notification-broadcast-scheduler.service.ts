import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationBroadcastPersistence } from '@app/backend-feature-notification-shared';

@Injectable()
export class NotificationBroadcastSchedulerService {
  private readonly logger = new Logger(NotificationBroadcastSchedulerService.name);

  constructor(private readonly persistence: NotificationBroadcastPersistence) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async run(): Promise<void> {
    try {
      const activated = await this.persistence.activateDueBroadcasts(new Date());
      const refreshed = await this.persistence.refreshBroadcastStatistics();
      this.logger.debug(`Activated ${activated} and refreshed ${refreshed} notification broadcasts`);
    } catch (error) {
      this.logger.error(
        'Notification broadcast scheduler iteration failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
