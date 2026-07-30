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

export interface ClaimPendingNotificationDeliveriesParams {
  targetType: NotificationTargetType;
  targetId?: string;
  count: number;
  now: Date;
}

export interface NotificationDeliveryClaim<T = NotificationData> {
  claimToken: string;
  claimedAt: Date;
  leaseExpiresAt: Date;
  deliveries: PendingNotificationDelivery<T>[];
}

export interface NotificationDeliveryAttemptIdentity {
  id: string;
  createdAt: Date;
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

  abstract claimPendingDeliveries<T = NotificationData>(
    params: ClaimPendingNotificationDeliveriesParams,
  ): Promise<NotificationDeliveryClaim<T> | null>;

  abstract renewDeliveryClaim(claimToken: string, now: Date): Promise<boolean>;

  abstract beginClaimedDeliveryAttempts(
    deliveries: NotificationDeliveryAttemptIdentity[],
    claimToken: string,
    now: Date,
  ): Promise<NotificationDeliveryAttemptIdentity[]>;

  abstract saveClaimedDeliveryResults(results: NotificationDeliveryResult[], claimToken: string): Promise<void>;

  abstract countRecentDeliveryErrors(params: FindRecentNotificationDeliveryErrorsParams): Promise<number>;
}
