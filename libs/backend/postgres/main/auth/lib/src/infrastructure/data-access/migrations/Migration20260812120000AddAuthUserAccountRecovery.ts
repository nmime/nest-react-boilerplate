import { Migration } from '@mikro-orm/migrations';

/**
 * Backs the account-recovery flows: a verification timestamp and the credential epoch that access
 * guards compare a session against.
 */
export class Migration20260812120000AddAuthUserAccountRecovery extends Migration {
  override up(): void {
    // The epoch means "never confirmed", the same sentinel `last_login_at` already uses on this
    // table. Existing rows inherit it, so an account that has never confirmed its address stays
    // distinguishable from one that confirmed it at deploy time without the column being nullable.
    this.addSql(
      `alter table "auth_users" add column if not exists "email_verified_at" timestamptz not null default 'epoch'::timestamptz;`,
    );

    // Existing rows take revision 0, which is exactly what a session minted before this column
    // existed reports. Backfilling any other value would sign every logged-in user out on deploy.
    this.addSql('alter table "auth_users" add column if not exists "credential_revision" int not null default 0;');
  }

  override down(): void {
    this.addSql('alter table "auth_users" drop column if exists "credential_revision";');
    this.addSql('alter table "auth_users" drop column if exists "email_verified_at";');
  }
}
