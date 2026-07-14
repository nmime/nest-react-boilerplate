import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationEntity,
  NotificationStatus,
  NotificationRepository,
} from '@app/backend-postgres-main-notification';
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
    private readonly notificationRepository: NotificationRepository,
    private readonly notificationHealthConfigService: NotificationHealthConfigService,
  ) {}

  async checkPushNotificationDelivery(): Promise<NotificationHealthResult> {
    try {
      const { alertIntervalMinutes, errorThreshold } = this.notificationHealthConfigService;
      const alertIntervalAgo = subMinutes(new Date(), alertIntervalMinutes);

      const systemErrorNotifications = await this.getRecentSystemErrorNotifications(alertIntervalAgo, 10);

      if (systemErrorNotifications.length <= errorThreshold) {
        return { healthy: true, message: 'Push notification delivery working stable' };
      }

      const { responsibleTag } = this.notificationHealthConfigService;
      const responsibleTagSuffix = responsibleTag ? ` (${responsibleTag})` : '';

      return {
        healthy: false,
        message: `Push notification delivery failures detected${responsibleTagSuffix}`,
        systemErrorsCount: systemErrorNotifications.length,
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

  private async getRecentSystemErrorNotifications(fromDate: Date, limit: number): Promise<NotificationEntity[]> {
    return this.notificationRepository.manager.find(
      NotificationEntity,
      { status: NotificationStatus.Error, updatedAt: { $gt: fromDate } },
      { orderBy: { updatedAt: 'DESC' }, limit },
    );
  }
}
