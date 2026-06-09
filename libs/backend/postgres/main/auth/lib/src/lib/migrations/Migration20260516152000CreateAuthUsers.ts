import { Migration } from "@mikro-orm/migrations";

export class Migration20260516152000CreateAuthUsers extends Migration {
  override up(): void {
    this.addSql(`
      create table "auth_users" (
        "id" uuid not null,
        "email" varchar(320) not null,
        "display_name" varchar(160) not null default '',
        "password_hash" varchar(255) not null default '',
        "status" varchar(32) not null default 'active',
        "roles" jsonb not null default '[]'::jsonb,
        "permissions" jsonb not null default '[]'::jsonb,
        "locale" varchar(16) not null default 'en',
        "last_login_at" timestamptz not null default 'epoch'::timestamptz,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__auth_users" primary key ("id"),
        constraint "uq__auth_users__email" unique ("email"),
        constraint "ck__auth_users__locale" check ("locale" in ('en', 'es'))
      );
    `);
  }

  override down(): void {
    this.addSql('drop table if exists "auth_users" cascade;');
  }
}
