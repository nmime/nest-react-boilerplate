import { Migration } from '@mikro-orm/migrations';

/** Removes the retired first-party refresh-token schema after cookie-session migration. */
export class Migration20260722090000DropLegacyRefreshTokens extends Migration {
  override up(): void {
    this.addSql('drop table if exists "auth_refresh_tokens";');
  }

  override down(): void {
    this.addSql(`
      create table if not exists "auth_refresh_tokens" (
        "id" uuid primary key,
        "tenant_id" uuid not null default '00000000-0000-0000-0000-000000000000',
        "user_id" uuid not null,
        "token_hash" varchar(128) not null,
        "family_id" uuid not null,
        "parent_token_id" uuid null,
        "expires_at" timestamptz not null,
        "revoked_at" timestamptz null,
        "replaced_by_token_id" uuid null,
        "auth_context" jsonb not null default '{}'::jsonb,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "uq__auth_refresh_tokens__token_hash" unique ("token_hash"),
        constraint "fk__auth_refresh_tokens__tenant_id" foreign key ("tenant_id")
          references "auth_tenants" ("id") on delete cascade,
        constraint "fk__auth_refresh_tokens__user_id" foreign key ("user_id")
          references "auth_users" ("id") on delete cascade
      );
    `);
    this.addSql(
      'create index if not exists "ix__auth_refresh_tokens__tenant_id_user_id" on "auth_refresh_tokens" ("tenant_id", "user_id");',
    );
    this.addSql(
      'create index if not exists "ix__auth_refresh_tokens__family_id" on "auth_refresh_tokens" ("family_id");',
    );
    this.addSql(
      'create index if not exists "ix__auth_refresh_tokens__expires_at" on "auth_refresh_tokens" ("expires_at");',
    );
  }
}
