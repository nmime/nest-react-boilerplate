import type {
  NotificationData,
  NotificationDeliveryChannel,
  NotificationDeliveryProvider,
  NotificationExtra,
  NotificationPriority,
  NotificationSensitiveData,
  NotificationTargetType,
} from '@app/common-notifications';

/** A delivery channel paired with the immutable provider selected for it. */
export interface NotificationDeliveryRoute {
  channel: NotificationDeliveryChannel;
  provider: NotificationDeliveryProvider;
}

export type CreateTemplateNotificationParams<T = NotificationData> = {
  targetType: NotificationTargetType;
  targetId: string;
  templateCode: string;
  /**
   * Preferred explicit routing surface. The selected provider is persisted on
   * the delivery so retries never silently switch transport.
   */
  deliveries?: NotificationDeliveryRoute[];
  /** @deprecated Use `deliveries` to choose a provider explicitly. */
  channels?: NotificationDeliveryChannel[];
  inAppVisible?: boolean;
  priority?: NotificationPriority;
  sendAfter?: Date;
  data?: T;
  sensitiveData?: NotificationSensitiveData;
  extra?: NotificationExtra;
};
