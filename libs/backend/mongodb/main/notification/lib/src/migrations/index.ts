import { Migration20260726000400InitializeNotifications } from './Migration20260726000400InitializeNotifications';
import { Migration20260826190100NotificationTenantOwnership } from './Migration20260826190100NotificationTenantOwnership';

export * from './Migration20260726000400InitializeNotifications';
export * from './Migration20260826190100NotificationTenantOwnership';

export const notificationMongoMigrations = [
  Migration20260726000400InitializeNotifications,
  Migration20260826190100NotificationTenantOwnership,
] as const;
