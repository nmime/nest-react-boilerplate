import { Migration20260812090000InitializeFiatCurrencies } from './Migration20260812090000InitializeFiatCurrencies';

export * from './Migration20260812090000InitializeFiatCurrencies';

export const fiatCurrencyMongoMigrations = [Migration20260812090000InitializeFiatCurrencies] as const;
