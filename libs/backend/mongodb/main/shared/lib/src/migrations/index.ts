import { Migration20260726000000CreateBetterAuthCollections } from './Migration20260726000000CreateBetterAuthCollections';
import { Migration20260726000100CreateCanonicalSessions } from './Migration20260726000100CreateCanonicalSessions';

export * from './Migration20260726000000CreateBetterAuthCollections';
export * from './Migration20260726000100CreateCanonicalSessions';
export * from './mongo-migration';

export const sharedMongoMigrations = [
  Migration20260726000000CreateBetterAuthCollections,
  Migration20260726000100CreateCanonicalSessions,
] as const;
