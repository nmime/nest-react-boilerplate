import type { NotificationDeliveryChannel, NotificationTargetType } from '@app/common-notifications';

export interface ResolvedNotificationRecipient {
  address: string;
  language?: string;
}

/** Maps a domain target (for example a user id) to a channel address. */
export abstract class NotificationRecipientResolver {
  abstract resolve(
    targetType: NotificationTargetType,
    targetId: string,
    channel: NotificationDeliveryChannel,
  ): Promise<ResolvedNotificationRecipient | null>;
}
