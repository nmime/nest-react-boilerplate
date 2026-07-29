import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { NotificationDeliveryPartitionMaintenance } from '@app/backend-feature-notification-shared';

@Injectable()
export class PostgresNotificationDeliveryPartitionMaintenance extends NotificationDeliveryPartitionMaintenance {
  constructor(@Inject(EntityManager) private readonly entityManager: EntityManager) {
    super();
  }

  async ensurePartitions(aheadMonths: number, now: Date = new Date()): Promise<void> {
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
  }
}
