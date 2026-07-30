import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationDeliveryPartitionMaintenance } from '@app/backend-feature-notification-shared';
import { NotificationConfigService } from '../config';

@Injectable()
export class NotificationDeliveryPartitionService implements OnModuleInit {
  private readonly logger = new Logger(NotificationDeliveryPartitionService.name);

  constructor(
    private readonly maintenance: NotificationDeliveryPartitionMaintenance,
    private readonly config: NotificationConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensurePartitions();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async ensurePartitions(): Promise<void> {
    const aheadMonths = Math.min(24, Math.max(1, this.config.deliveriesPartitionAheadMonths));
    await this.maintenance.ensurePartitions(aheadMonths);
    this.logger.debug(`Notification delivery partitions ensured ${aheadMonths} months ahead`);
  }
}
