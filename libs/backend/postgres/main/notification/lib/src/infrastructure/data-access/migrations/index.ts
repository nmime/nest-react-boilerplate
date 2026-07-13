import type { MigrationsOptions } from '@mikro-orm/core';
import { Migration20260715100000CreateNotifications } from './Migration20260715100000CreateNotifications';

export const notificationMigrations = [Migration20260715100000CreateNotifications] as const;

export const notificationMigrationOptions: MigrationsOptions = {
  tableName: 'mikro_orm_migrations',
  transactional: true,
  allOrNothing: true,
  silent: true,
  snapshot: false,
  migrationsList: [...notificationMigrations],
};

export * from './Migration20260715100000CreateNotifications';
