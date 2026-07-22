import { Migration } from '@mikro-orm/migrations';

/** Removes denormalized authorization arrays after normalized RBAC backfill. */
export class Migration20260722091000DropLegacyAuthUserAccessCache extends Migration {
  override up(): void {
    this.addSql('alter table "auth_users" drop column if exists "roles";');
    this.addSql('alter table "auth_users" drop column if exists "permissions";');
  }

  override down(): void {
    this.addSql(`alter table "auth_users" add column if not exists "roles" jsonb not null default '[]'::jsonb;`);
    this.addSql(`alter table "auth_users" add column if not exists "permissions" jsonb not null default '[]'::jsonb;`);
  }
}
