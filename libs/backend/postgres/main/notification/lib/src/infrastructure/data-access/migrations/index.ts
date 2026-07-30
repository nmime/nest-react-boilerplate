import type { MigrationsOptions } from '@mikro-orm/core';
import { Migration20260715100000CreateNotifications } from './Migration20260715100000CreateNotifications';
import { Migration20260720130000AddNotificationDeliveryClaim } from './Migration20260720130000AddNotificationDeliveryClaim';
import { Migration20260721120000NotificationProvidersAndSensitivePayload } from './Migration20260721120000NotificationProvidersAndSensitivePayload';
import { Migration20260721160000AdminNotificationBroadcasts } from './Migration20260721160000AdminNotificationBroadcasts';
import { Migration20260726180000NotificationClaimTokens } from './Migration20260726180000NotificationClaimTokens';
import { Migration20260729190000NotificationDeliveryClaimOwnership as NotificationDeliveryClaimOwnershipMigration } from './Migration20260729190000NotificationDeliveryClaimOwnership';

export class Migration20260729190000NotificationDeliveryClaimOwnership extends NotificationDeliveryClaimOwnershipMigration {
  override down(): void {
    this.addSql('drop index if exists "ix__notification_deliveries__claim_token";');
    this.addSql('alter table "notification_deliveries" drop column if exists "dispatch_started_at";');
  }
}

export const notificationMigrations = [
  Migration20260715100000CreateNotifications,
  Migration20260720130000AddNotificationDeliveryClaim,
  Migration20260721120000NotificationProvidersAndSensitivePayload,
  Migration20260721160000AdminNotificationBroadcasts,
  Migration20260726180000NotificationClaimTokens,
  Migration20260729190000NotificationDeliveryClaimOwnership,
] as const;

export const notificationMigrationOptions: MigrationsOptions = {
  tableName: 'mikro_orm_migrations',
  transactional: true,
  allOrNothing: true,
  silent: true,
  snapshot: false,
  migrationsList: [...notificationMigrations],
};

export * from './Migration20260715100000CreateNotifications';
export * from './Migration20260720130000AddNotificationDeliveryClaim';
export * from './Migration20260721120000NotificationProvidersAndSensitivePayload';
export * from './Migration20260721160000AdminNotificationBroadcasts';
export * from './Migration20260726180000NotificationClaimTokens';
