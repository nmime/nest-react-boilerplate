import { Migration } from "@mikro-orm/migrations";

export class Migration20260517141000AddAuthUserLocale extends Migration {
  override up(): void {
    this.addSql(
      'alter table "auth_users" add column if not exists "locale" varchar(16) null;',
    );
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conname = 'auth_users_locale_check'
        ) then
          alter table "auth_users"
            add constraint "auth_users_locale_check"
            check ("locale" is null or "locale" in ('en', 'es'));
        end if;
      end $$;
    `);
  }

  override down(): void {
    this.addSql(
      'alter table "auth_users" drop constraint if exists "auth_users_locale_check";',
    );
    this.addSql('alter table "auth_users" drop column if exists "locale";');
  }
}
