import type {
  NotificationChannel,
  NotificationData,
  NotificationExtra,
  NotificationPriority,
  NotificationTargetType,
} from '@app/backend-postgres-main-notification';

export type CreateTemplateNotificationParams<T = NotificationData> = {
  channel: NotificationChannel;
  targetType: NotificationTargetType;
  targetId: string;
  templateCode: string;
  priority?: NotificationPriority;
  data?: T;
  extra?: NotificationExtra;
};
