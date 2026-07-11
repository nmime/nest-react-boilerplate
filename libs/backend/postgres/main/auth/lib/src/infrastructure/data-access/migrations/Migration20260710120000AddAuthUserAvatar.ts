import { Migration } from '@mikro-orm/migrations';

export class Migration20260710120000AddAuthUserAvatar extends Migration {
  override up(): void {
    // Empty strings represent an absent avatar while keeping new columns safe for existing rows.
    this.addSql('alter table "auth_users" add column if not exists "avatar_url" varchar(2048) not null default \'\';');
    this.addSql('alter table "auth_users" add column if not exists "avatar_hash" varchar(64) not null default \'\';');

    // Add avatar_status column (not null; tracks provenance of the avatar)
    this.addSql(
      'alter table "auth_users" add column if not exists "avatar_status" varchar(16) not null default \'none\';',
    );

    // Add check constraint for avatar_status values
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conname = 'ck__auth_users__avatar_status'
        ) then
          alter table "auth_users"
            add constraint "ck__auth_users__avatar_status"
            check ("avatar_status" in ('none', 'provider', 'manual', 'deleted'));
        end if;
      end $$;
    `);

    // Preserve provenance if a deployment populated avatar_url before this migration completed.
    this.addSql(`
      update "auth_users"
      set "avatar_status" = 'provider'
      where "avatar_url" <> ''
        and "avatar_status" = 'none';
    `);
  }

  override down(): void {
    this.addSql('alter table "auth_users" drop constraint if exists "ck__auth_users__avatar_status";');
    this.addSql('alter table "auth_users" drop column if exists "avatar_status";');
    this.addSql('alter table "auth_users" drop column if exists "avatar_hash";');
    this.addSql('alter table "auth_users" drop column if exists "avatar_url";');
  }
}
