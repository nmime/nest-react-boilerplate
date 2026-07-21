import type { MigrationsOptions } from '@mikro-orm/core';
import { Migration20260715100000CreateNotifications } from './Migration20260715100000CreateNotifications';
import { Migration20260720130000AddNotificationDeliveryClaim } from './Migration20260720130000AddNotificationDeliveryClaim';
import { Migration20260721120000NotificationProvidersAndSensitivePayload } from './Migration20260721120000NotificationProvidersAndSensitivePayload';
import { Migration20260721160000AdminNotificationBroadcasts } from './Migration20260721160000AdminNotificationBroadcasts';

export const notificationMigrations = [
  Migration20260715100000CreateNotifications,
  Migration20260720130000AddNotificationDeliveryClaim,
  Migration20260721120000NotificationProvidersAndSensitivePayload,
  Migration20260721160000AdminNotificationBroadcasts,
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
