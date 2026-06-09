import { Migration } from "@mikro-orm/migrations";

export class Migration20260518163000AddAuthUserTheme extends Migration {
  override up(): void {
    this.addSql(
      'alter table "auth_users" add column if not exists "theme" varchar(16) not null default \'system\';',
    );
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conname = 'ck__auth_users__theme'
        ) then
          alter table "auth_users"
            add constraint "ck__auth_users__theme"
            check ("theme" in ('system', 'light', 'dark'));
        end if;
      end $$;
    `);
  }

  override down(): void {
    this.addSql(
      'alter table "auth_users" drop constraint if exists "ck__auth_users__theme";',
    );
    this.addSql('alter table "auth_users" drop column if exists "theme";');
  }
}
