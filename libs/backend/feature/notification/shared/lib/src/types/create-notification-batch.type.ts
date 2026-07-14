import type {
  NotificationChannel,
  NotificationData,
  NotificationExtra,
  NotificationPriority,
  NotificationTargetType,
} from '@app/backend-postgres-main-notification';

export type CreateTemplateNotificationBatch<T = NotificationData> = {
  channel: NotificationChannel;
  targetType: NotificationTargetType;
  items: {
    targetId: string;
    data?: T;
    extra?: NotificationExtra;
    templateCode: string;
    priority?: NotificationPriority;
  }[];
};
