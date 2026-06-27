import { Migration } from "@mikro-orm/migrations";

export class Migration20260517141000AddAuthUserLocale extends Migration {
  override up(): void {
    this.addSql(
      'alter table "auth_users" add column if not exists "locale" varchar(16) not null default \'en\';',
    );
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conname = 'ck__auth_users__locale'
        ) then
          alter table "auth_users"
            add constraint "ck__auth_users__locale"
            check ("locale" in ('en', 'es'));
        end if;
      end $$;
    `);
  }

  override down(): void {
    this.addSql(
      'alter table "auth_users" drop constraint if exists "ck__auth_users__locale";',
    );
    this.addSql('alter table "auth_users" drop column if exists "locale";');
  }
}
