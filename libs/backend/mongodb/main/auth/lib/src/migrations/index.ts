import { Migration20260726000200InitializeAuthPersistence } from './Migration20260726000200InitializeAuthPersistence';
import { Migration20260812120000AddAuthUserAccountRecovery } from './Migration20260812120000AddAuthUserAccountRecovery';

export * from './Migration20260726000200InitializeAuthPersistence';
export * from './Migration20260812120000AddAuthUserAccountRecovery';

export const authMongoMigrations = [
  Migration20260726000200InitializeAuthPersistence,
  Migration20260812120000AddAuthUserAccountRecovery,
] as const;
