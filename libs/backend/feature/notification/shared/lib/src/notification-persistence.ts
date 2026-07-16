import type {
  NotificationData,
  NotificationDeliveryResult,
  NotificationRecord,
  NotificationTemplateRecord,
  NotificationTargetType,
  PendingNotificationDelivery,
} from '@app/common-notifications';
import type {
  CreateTemplateNotificationBatch,
  CreateTemplateNotificationParams,
  UpsertNotificationTemplateParams,
} from './types';

export interface FindPendingNotificationDeliveriesParams {
  targetType: NotificationTargetType;
  targetId?: string;
  count: number;
  now: Date;
}

export interface FindRecentNotificationDeliveryErrorsParams {
  targetType?: NotificationTargetType;
  fromDate: Date;
  limit: number;
}

/**
 * Persistence boundary for notification use cases.
 *
 * Implementations own transactions, entity mapping, queue ordering, and retry
 * scheduling. Feature code must never depend on database entities directly.
 */
export abstract class NotificationPersistence {
  abstract upsertTemplate(params: UpsertNotificationTemplateParams): Promise<NotificationTemplateRecord>;

  abstract create<T>(params: CreateTemplateNotificationParams<T>): Promise<NotificationRecord<T>>;

  abstract createBatch<T>(params: CreateTemplateNotificationBatch<T>): Promise<NotificationRecord<T>[]>;

  abstract findPendingDeliveries<T = NotificationData>(
    params: FindPendingNotificationDeliveriesParams,
  ): Promise<PendingNotificationDelivery<T>[]>;

  abstract saveDeliveryResults(results: NotificationDeliveryResult[]): Promise<void>;

  abstract countRecentDeliveryErrors(params: FindRecentNotificationDeliveryErrorsParams): Promise<number>;
}
