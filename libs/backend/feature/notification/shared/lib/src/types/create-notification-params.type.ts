import type {
  NotificationData,
  NotificationDeliveryChannel,
  NotificationExtra,
  NotificationPriority,
  NotificationTargetType,
} from '@app/common-notifications';

export type CreateTemplateNotificationParams<T = NotificationData> = {
  targetType: NotificationTargetType;
  targetId: string;
  templateCode: string;
  channels?: NotificationDeliveryChannel[];
  inAppVisible?: boolean;
  priority?: NotificationPriority;
  sendAfter?: Date;
  data?: T;
  extra?: NotificationExtra;
};
