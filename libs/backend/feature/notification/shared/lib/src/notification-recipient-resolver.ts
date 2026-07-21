import type { NotificationDeliveryRecord, NotificationTargetType } from '@app/common-notifications';

export interface ResolvedNotificationRecipient {
  address: string;
  language?: string;
}

/** Maps a domain target (for example a user id) to a concrete provider address. */
export abstract class NotificationRecipientResolver {
  abstract resolve(
    targetType: NotificationTargetType,
    targetId: string,
    delivery: NotificationDeliveryRecord,
  ): Promise<ResolvedNotificationRecipient | null>;
}
