import { format } from 'date-fns';
import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, NotificationTargetType } from '../domain';
import { NotificationEntity } from '../infrastructure/data-access/entities';
import { NotificationTemplateChannelEntity } from '../infrastructure/data-access/entities';

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

    const values: unknown[] = [targetType, NotificationStatus.Pending, currentTime];
    const targetClause = targetId ? 'and notification.target_id = ?' : '';
    if (targetId) {
      values.push(targetId);
    }
    values.push(count);

    const idRows = await this.entityManager.getConnection().execute<Array<{ id: string }>>(
      `select notification.id
         from notifications notification
         inner join notification_deliveries delivery
           on delivery.notification_id = notification.id
          and delivery.channel = notification.channel
        where notification.target_type = ?
          and delivery.status = ?
          and (delivery.send_time_from is null or delivery.send_time_from <= ?)
          and (delivery.send_time_to is null or delivery.send_time_to >= ?)
          ${targetClause}
        order by delivery.priority desc, delivery.id asc
        limit ?`,
      values,
    );

    if (idRows.length === 0) {
      return [];
    }

    const ids = idRows.map((row) => row.id);
    const notifications = await this.entityManager.find(
      NotificationEntity,
      { id: { $in: ids } },
      { populate: ['template'] },
    );
    const templateIds = notifications.flatMap((notification) =>
      notification.template ? [notification.template.id] : [],
    );
    if (templateIds.length > 0) {
      const botChannels = await this.entityManager.find(NotificationTemplateChannelEntity, {
        templateId: { $in: templateIds },
        channel: NotificationChannel.Bot,
      });
      const channelByTemplateId = new Map(botChannels.map((channel) => [channel.templateId, channel]));
      for (const notification of notifications) {
        if (notification.template) {
          notification.template.botChannel = channelByTemplateId.get(notification.template.id) ?? null;
        }
      }
    }

    const notificationById = new Map(notifications.map((notification) => [notification.id, notification]));
    return ids.flatMap((id) => {
      const notification = notificationById.get(id);
      return notification ? [notification] : [];
    });
  }

  async findPendingTargets(targetType: NotificationTargetType): Promise<string[]> {
    const currentTime = format(new Date(), 'HH:mm:ss');

    const results = await this.entityManager.getConnection().execute<Array<{ target_id: string }>>(
      `select distinct notification.target_id
         from notifications notification
         inner join notification_deliveries delivery
           on delivery.notification_id = notification.id
          and delivery.channel = notification.channel
        where notification.target_type = ?
          and delivery.status = ?
          and (delivery.send_time_from is null or delivery.send_time_from <= ?)
          and (delivery.send_time_to is null or delivery.send_time_to >= ?)`,
      [targetType, NotificationStatus.Pending, currentTime],
    );

    return results.map((result) => result.target_id);
  }
}
