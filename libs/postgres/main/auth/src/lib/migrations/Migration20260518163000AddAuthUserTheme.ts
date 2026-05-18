import { Migration } from "@mikro-orm/migrations";

export class Migration20260518163000AddAuthUserTheme extends Migration {
  override up(): void {
    this.addSql(
      'alter table "auth_users" add column if not exists "theme" varchar(16) null default \'system\';',
    );
    this.addSql(
      `update "auth_users" set "theme" = 'system' where "theme" is null;`,
    );
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conname = 'auth_users_theme_check'
        ) then
          alter table "auth_users"
            add constraint "auth_users_theme_check"
            check ("theme" in ('system', 'light', 'dark'));
        end if;
      end $$;
    `);
  }

  override down(): void {
    this.addSql(
      'alter table "auth_users" drop constraint if exists "auth_users_theme_check";',
    );
    this.addSql('alter table "auth_users" drop column if exists "theme";');
  }
}
