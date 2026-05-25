import { Migration } from "@mikro-orm/migrations";

export class Migration20260516152000CreateAuthUsers extends Migration {
  override up(): void {
    this.addSql(`
      create table "auth_users" (
        "id" uuid not null,
        "email" varchar(320) not null,
        "display_name" varchar(160) null,
        "password_hash" varchar(255) not null default '',
        "status" varchar(32) not null default 'active',
        "roles" jsonb not null default '[]'::jsonb,
        "permissions" jsonb not null default '[]'::jsonb,
        "locale" varchar(16) null,
        "last_login_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "auth_users_pkey" primary key ("id"),
        constraint "auth_users_email_key" unique ("email"),
        constraint "auth_users_locale_check" check ("locale" is null or "locale" in ('en', 'es'))
      );
    `);
  }

  override down(): void {
    this.addSql('drop table if exists "auth_users" cascade;');
  }
}
