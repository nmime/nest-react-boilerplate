import type { MigrationsOptions } from '@mikro-orm/core';
import { Migration20260812090000CreateFiatCurrencies } from './Migration20260812090000CreateFiatCurrencies';

export const fiatCurrencyMigrations = [Migration20260812090000CreateFiatCurrencies] as const;

export const fiatCurrencyMigrationOptions: MigrationsOptions = {
  tableName: 'mikro_orm_migrations',
  transactional: true,
  allOrNothing: true,
  silent: true,
  snapshot: false,
  migrationsList: [...fiatCurrencyMigrations],
};

export * from './Migration20260812090000CreateFiatCurrencies';
