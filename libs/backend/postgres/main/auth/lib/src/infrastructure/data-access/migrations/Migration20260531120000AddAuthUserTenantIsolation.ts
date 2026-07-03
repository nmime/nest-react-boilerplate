import { Migration } from "@mikro-orm/migrations";

export class Migration20260531120000AddAuthUserTenantIsolation extends Migration {
  override up(): void {
    this.addSql(`
      alter table "auth_users"
        add column if not exists "tenant_id" uuid not null default '00000000-0000-0000-0000-000000000000';
    `);
    this.addSql(`
      alter table "auth_users" drop constraint if exists "auth_users_email_key";
      alter table "auth_users" drop constraint if exists "uq__auth_users__email";
    `);
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1 from pg_constraint where conname = 'uq__auth_users__tenant_id_email'
        ) then
          alter table "auth_users"
            add constraint "uq__auth_users__tenant_id_email"
            unique ("tenant_id", "email");
        end if;
      end $$;
    `);
    this.addSql(
      'create index if not exists "ix__auth_users__tenant_id" on "auth_users" ("tenant_id");',
    );
  }

  override down(): void {
    this.addSql('drop index if exists "ix__auth_users__tenant_id";');
    this.addSql(
      'alter table "auth_users" drop constraint if exists "uq__auth_users__tenant_id_email";',
    );
    this.addSql(`
      do $$
      begin
        if not exists (
          select 1 from pg_constraint where conname = 'uq__auth_users__email'
        ) then
          alter table "auth_users"
            add constraint "uq__auth_users__email"
            unique ("email");
        end if;
      end $$;
    `);
    this.addSql('alter table "auth_users" drop column if exists "tenant_id";');
  }
}
