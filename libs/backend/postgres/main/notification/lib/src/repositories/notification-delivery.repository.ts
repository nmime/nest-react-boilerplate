import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationDeliveryProvider, NotificationPriority, NotificationStatus } from '../domain';

@Injectable()
export class NotificationDeliveryRepository {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {}

  get manager(): EntityManager {
    return this.entityManager;
  }

  async createBotDeliveriesForNotificationIds(notificationIds: string[]): Promise<void> {
    if (!notificationIds.length) {
      return;
    }

    const placeholders = notificationIds.map((_, i) => `$${i + 4}`).join(', ');

    await this.entityManager.getConnection().execute(
      `insert into notification_deliveries
         (notification_id, channel, status, provider, priority, send_time_from, send_time_to, created_at, updated_at)
       select n.id, n.channel, $1, $2, n.priority, n.send_time_from, n.send_time_to, n.created_at, n.created_at
         from notifications n
        where n.id::text in (${placeholders})
          and n.channel = $3
          and not exists (
            select 1 from notification_deliveries d where d.notification_id = n.id and d.channel = n.channel
          )`,
      [NotificationStatus.Pending, NotificationDeliveryProvider.Telegram, NotificationChannel.Bot, ...notificationIds],
    );
  }

  async applyStatusFromNotifications(notificationIds: string[]): Promise<void> {
    if (!notificationIds.length) {
      return;
    }

    const placeholders = notificationIds.map((_, i) => `$${i + 4}`).join(', ');

    await this.entityManager.getConnection().execute(
      `update notification_deliveries d
         set status = n.status,
             error = n.error,
             attempts = case when n.status in ($1, $2) then d.attempts + 1 else d.attempts end,
             sent_at = case when n.status = $3 then now() else d.sent_at end,
             updated_at = now()
         from notifications n
        where n.id::text = d.notification_id
          and n.channel = d.channel
          and n.id::text in (${placeholders})`,
      [NotificationStatus.Sent, NotificationStatus.Error, NotificationStatus.Sent, ...notificationIds],
    );
  }
}
