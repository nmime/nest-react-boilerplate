import type {
  NotificationData,
  NotificationDeliveryChannel,
  NotificationExtra,
  NotificationPriority,
  NotificationSensitiveData,
  NotificationTargetType,
} from '@app/common-notifications';
import type { NotificationDeliveryRoute } from './create-notification-params.type';

export type CreateTemplateNotificationBatch<T = NotificationData> = {
  targetType: NotificationTargetType;
  deliveries?: NotificationDeliveryRoute[];
  channels?: NotificationDeliveryChannel[];
  inAppVisible?: boolean;
  priority?: NotificationPriority;
  sendAfter?: Date;
  items: {
    targetId: string;
    data?: T;
    extra?: NotificationExtra;
    templateCode: string;
    deliveries?: NotificationDeliveryRoute[];
    channels?: NotificationDeliveryChannel[];
    inAppVisible?: boolean;
    priority?: NotificationPriority;
    sendAfter?: Date;
    sensitiveData?: NotificationSensitiveData;
  }[];
};
