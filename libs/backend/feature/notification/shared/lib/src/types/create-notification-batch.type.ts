import type {
  NotificationData,
  NotificationDeliveryChannel,
  NotificationExtra,
  NotificationPriority,
  NotificationTargetType,
} from '@app/common-notifications';

export type CreateTemplateNotificationBatch<T = NotificationData> = {
  targetType: NotificationTargetType;
  channels?: NotificationDeliveryChannel[];
  inAppVisible?: boolean;
  priority?: NotificationPriority;
  sendAfter?: Date;
  items: {
    targetId: string;
    data?: T;
    extra?: NotificationExtra;
    templateCode: string;
    channels?: NotificationDeliveryChannel[];
    inAppVisible?: boolean;
    priority?: NotificationPriority;
    sendAfter?: Date;
  }[];
};
