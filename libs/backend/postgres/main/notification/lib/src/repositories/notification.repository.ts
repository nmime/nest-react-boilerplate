import { EntityManager } from '@mikro-orm/core';
import { format } from 'date-fns';
import { Inject, Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationTargetType,
  type NotificationEntity,
} from '../domain';

@Injectable()
export class NotificationRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  get manager(): EntityManager {
    return this.entityManager;
  }

  async findPending(params: {
    targetType: NotificationTargetType;
    targetId?: string;
    count: number;
  }): Promise<NotificationEntity[]> {
    const { targetType, targetId, count } = params;
    const currentTime = format(new Date(), 'HH:mm:ss');

    const qb = this.entityManager
      .createQueryBuilder(NotificationEntity.name as any, 'notification')
      .innerJoin(
        'notification_deliveries',
        'delivery',
        'delivery.notification_id = notification.id AND delivery.channel = notification.channel',
      )
      .where({ 'notification.target_type': targetType, 'delivery.status': NotificationStatus.Pending })
      .andWhereRaw(
        '(delivery.send_time_from IS NULL OR delivery.send_time_from <= %L) AND (delivery.send_time_to IS NULL OR delivery.send_time_to >= %L)',
        [currentTime, currentTime],
      )
      .orderBy({ 'delivery.priority': 'DESC', 'delivery.id': 'ASC' })
      .limit(count);

    if (targetId) {
      qb.andWhere({ 'notification.target_id': targetId });
    }

    return (await qb.execute('all')) as unknown as NotificationEntity[];
  }

  async findPendingTargets(targetType: NotificationTargetType): Promise<string[]> {
    const currentTime = format(new Date(), 'HH:mm:ss');

    const results = await this.entityManager
      .createQueryBuilder(NotificationEntity.name as any, 'notification')
      .select('DISTINCT notification.target_id')
      .innerJoin(
        'notification_deliveries',
        'delivery',
        'delivery.notification_id = notification.id AND delivery.channel = notification.channel',
      )
      .where({ 'notification.target_type': targetType, 'delivery.status': NotificationStatus.Pending })
      .andWhereRaw(
        '(delivery.send_time_from IS NULL OR delivery.send_time_from <= %L) AND (delivery.send_time_to IS NULL OR delivery.send_time_to >= %L)',
        [currentTime, currentTime],
      )
      .execute('all');

    return results.map((r: Record<string, unknown>) => String(r.target_id));
  }
}
