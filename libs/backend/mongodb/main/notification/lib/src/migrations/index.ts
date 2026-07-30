import { Migration20260726000400InitializeNotifications } from './Migration20260726000400InitializeNotifications';

export * from './Migration20260726000400InitializeNotifications';

export const notificationMongoMigrations = [Migration20260726000400InitializeNotifications] as const;
