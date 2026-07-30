import { Migration20260726000200InitializeAuthPersistence } from './Migration20260726000200InitializeAuthPersistence';

export * from './Migration20260726000200InitializeAuthPersistence';

export const authMongoMigrations = [Migration20260726000200InitializeAuthPersistence] as const;
