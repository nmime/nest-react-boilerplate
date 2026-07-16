import { Injectable, Logger } from '@nestjs/common';
import { NotificationPersistence } from '@app/backend-feature-notification-shared';
import { subMinutes } from 'date-fns';
import { NotificationHealthConfigService } from '../config';

export interface NotificationHealthResult {
  healthy: boolean;
  message: string;
  systemErrorsCount?: number;
  timeWindow?: string;
  threshold?: number;
}

@Injectable()
export class NotificationHealthService {
  private readonly logger = new Logger(NotificationHealthService.name);

  constructor(
    private readonly notificationPersistence: NotificationPersistence,
    private readonly notificationHealthConfigService: NotificationHealthConfigService,
  ) {}

  async checkPushNotificationDelivery(): Promise<NotificationHealthResult> {
    try {
      const { alertIntervalMinutes, errorThreshold } = this.notificationHealthConfigService;
      const alertIntervalAgo = subMinutes(new Date(), alertIntervalMinutes);

      const systemErrorsCount = await this.notificationPersistence.countRecentDeliveryErrors({
        fromDate: alertIntervalAgo,
        limit: errorThreshold + 1,
      });

      if (systemErrorsCount <= errorThreshold) {
        return { healthy: true, message: 'Notification delivery is stable' };
      }

      const { responsibleTag } = this.notificationHealthConfigService;
      const responsibleTagSuffix = responsibleTag ? ` (${responsibleTag})` : '';

      return {
        healthy: false,
        message: `Push notification delivery failures detected${responsibleTagSuffix}`,
        systemErrorsCount,
        timeWindow: `${alertIntervalMinutes} minutes`,
        threshold: errorThreshold,
      };
    } catch (error) {
      this.logger.error(
        'Error checking push notification delivery health',
        error instanceof Error ? error.message : String(error),
      );
      const { responsibleTag } = this.notificationHealthConfigService;
      return { healthy: false, message: `Failed to check push notification health (${responsibleTag})` };
    }
  }
}
