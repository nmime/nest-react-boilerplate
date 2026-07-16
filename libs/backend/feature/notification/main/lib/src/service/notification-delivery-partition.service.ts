import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationConfigService } from '../config';

@Injectable()
export class NotificationDeliveryPartitionService implements OnModuleInit {
  private readonly logger = new Logger(NotificationDeliveryPartitionService.name);

  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
    private readonly config: NotificationConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensurePartitions();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async ensurePartitions(): Promise<void> {
    const aheadMonths = Math.min(24, Math.max(1, this.config.deliveriesPartitionAheadMonths));
    const now = new Date();
    const statements: string[] = [];
    for (let offset = 0; offset <= aheadMonths; offset += 1) {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
      const partitionName = `notification_deliveries_${start.getUTCFullYear()}_${String(
        start.getUTCMonth() + 1,
      ).padStart(2, '0')}`;
      statements.push(
        `create table if not exists "${partitionName}"
           partition of notification_deliveries
           for values from ('${start.toISOString()}') to ('${end.toISOString()}')`,
      );
    }
    await Promise.all(statements.map((statement) => this.entityManager.getConnection().execute(statement)));
    this.logger.debug(`Notification delivery partitions ensured ${aheadMonths} months ahead`);
  }
}
