import { Migration } from "@mikro-orm/migrations";

export class Migration20260525184500NormalizeAuthUserDatabaseStandards extends Migration {
  override up(): void {
    this.addSql(`
      do $$
      begin
        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'email'
        ) then
          alter table "auth_users" alter column "email" set not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'display_name'
        ) then
          update "auth_users" set "display_name" = '' where "display_name" is null;
          alter table "auth_users" alter column "display_name" set default '';
          alter table "auth_users" alter column "display_name" set not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'password_hash'
        ) then
          update "auth_users" set "password_hash" = '' where "password_hash" is null;
          alter table "auth_users" alter column "password_hash" set default '';
          alter table "auth_users" alter column "password_hash" set not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'status'
        ) then
          update "auth_users" set "status" = 'active' where "status" is null;
          alter table "auth_users" alter column "status" set default 'active';
          alter table "auth_users" alter column "status" set not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'roles'
        ) then
          update "auth_users" set "roles" = '[]'::jsonb where "roles" is null;
          alter table "auth_users" alter column "roles" set default '[]'::jsonb;
          alter table "auth_users" alter column "roles" set not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'permissions'
        ) then
          update "auth_users" set "permissions" = '[]'::jsonb where "permissions" is null;
          alter table "auth_users" alter column "permissions" set default '[]'::jsonb;
          alter table "auth_users" alter column "permissions" set not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'locale'
        ) then
          update "auth_users" set "locale" = 'en' where "locale" is null;
          alter table "auth_users" alter column "locale" set default 'en';
          alter table "auth_users" alter column "locale" set not null;
          alter table "auth_users" drop constraint if exists "auth_users_locale_check";
          if not exists (
            select 1 from pg_constraint where conname = 'ck__auth_users__locale'
          ) then
            alter table "auth_users"
              add constraint "ck__auth_users__locale"
              check ("locale" in ('en', 'es'));
          end if;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'theme'
        ) then
          update "auth_users" set "theme" = 'system' where "theme" is null;
          alter table "auth_users" alter column "theme" set default 'system';
          alter table "auth_users" alter column "theme" set not null;
          alter table "auth_users" drop constraint if exists "auth_users_theme_check";
          if not exists (
            select 1 from pg_constraint where conname = 'ck__auth_users__theme'
          ) then
            alter table "auth_users"
              add constraint "ck__auth_users__theme"
              check ("theme" in ('system', 'light', 'dark'));
          end if;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'last_login_at'
        ) then
          update "auth_users"
          set "last_login_at" = 'epoch'::timestamptz
          where "last_login_at" is null;
          alter table "auth_users"
            alter column "last_login_at" set default 'epoch'::timestamptz;
          alter table "auth_users" alter column "last_login_at" set not null;
        end if;

        alter table "auth_users" drop constraint if exists "auth_users_email_key";
        if not exists (
          select 1 from pg_constraint where conname = 'uq__auth_users__email'
        ) then
          alter table "auth_users" add constraint "uq__auth_users__email" unique ("email");
        end if;
      end $$;
    `);
  }

  override down(): void {
    this.addSql(`
      do $$
      begin
        alter table "auth_users" drop constraint if exists "uq__auth_users__email";
        if not exists (
          select 1 from pg_constraint where conname = 'auth_users_email_key'
        ) then
          alter table "auth_users"
            add constraint "auth_users_email_key" unique ("email");
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'email'
        ) then
          alter table "auth_users" alter column "email" drop not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'display_name'
        ) then
          alter table "auth_users" alter column "display_name" drop default;
          alter table "auth_users" alter column "display_name" drop not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'password_hash'
        ) then
          alter table "auth_users" alter column "password_hash" drop default;
          alter table "auth_users" alter column "password_hash" drop not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'status'
        ) then
          alter table "auth_users" alter column "status" drop default;
          alter table "auth_users" alter column "status" drop not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'roles'
        ) then
          alter table "auth_users" alter column "roles" drop default;
          alter table "auth_users" alter column "roles" drop not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'permissions'
        ) then
          alter table "auth_users" alter column "permissions" drop default;
          alter table "auth_users" alter column "permissions" drop not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'locale'
        ) then
          alter table "auth_users" drop constraint if exists "ck__auth_users__locale";
          if not exists (
            select 1 from pg_constraint where conname = 'auth_users_locale_check'
          ) then
            alter table "auth_users"
              add constraint "auth_users_locale_check"
              check ("locale" in ('en', 'es'));
          end if;
          alter table "auth_users" alter column "locale" drop default;
          alter table "auth_users" alter column "locale" drop not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'theme'
        ) then
          alter table "auth_users" drop constraint if exists "ck__auth_users__theme";
          if not exists (
            select 1 from pg_constraint where conname = 'auth_users_theme_check'
          ) then
            alter table "auth_users"
              add constraint "auth_users_theme_check"
              check ("theme" in ('system', 'light', 'dark'));
          end if;
          alter table "auth_users" alter column "theme" drop default;
          alter table "auth_users" alter column "theme" drop not null;
        end if;

        if exists (
          select 1
          from information_schema.columns
          where table_name = 'auth_users' and column_name = 'last_login_at'
        ) then
          alter table "auth_users" alter column "last_login_at" drop default;
          alter table "auth_users" alter column "last_login_at" drop not null;
        end if;
      end $$;
    `);
  }
}
