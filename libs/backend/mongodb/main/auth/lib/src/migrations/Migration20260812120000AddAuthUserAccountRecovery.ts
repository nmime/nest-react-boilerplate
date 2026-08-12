import type { Db } from 'mongodb';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { MongoMigration } from '../../../../shared/lib/src/migrations/mongo-migration';
import { initializeMongoAuthPersistence, verifyMongoAuthPersistence } from '../auth-mongo.collections';

/**
 * Reopens the `auth_users` validator for `emailVerifiedAt` and `credentialRevision`.
 *
 * Databases provisioned before account recovery already have the bootstrap migration in the ledger,
 * so it never runs again — and their stored validator sets `additionalProperties: false`, which
 * would reject every credential replacement. Re-applying the definitions issues the `collMod` that
 * closes that gap. No document backfill: an absent field reads as never verified at revision zero,
 * which is exactly what sessions minted before the epoch claim.
 */
export const Migration20260812120000AddAuthUserAccountRecovery: MongoMigration = {
  id: '20260812120000_add_auth_user_account_recovery',
  name: 'AddAuthUserAccountRecovery',

  async up(database: Db): Promise<void> {
    await initializeMongoAuthPersistence(database);
  },

  async verify(database: Db): Promise<void> {
    await verifyMongoAuthPersistence(database);
  },
};
