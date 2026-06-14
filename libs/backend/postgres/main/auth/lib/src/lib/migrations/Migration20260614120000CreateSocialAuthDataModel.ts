import { Migration } from "@mikro-orm/migrations";

export class Migration20260614120000CreateSocialAuthDataModel extends Migration {
  override up(): void {
    this.addSql('alter table "auth_users" alter column "email" drop not null;');
    this.addSql(
      'alter table "auth_users" drop constraint if exists "auth_users_email_key";',
    );
    this.addSql(
      'alter table "auth_users" drop constraint if exists "uq__auth_users__email";',
    );
    this.addSql(
      'alter table "auth_users" drop constraint if exists "uq__auth_users__tenant_id_email";',
    );
    this.addSql(
      'create unique index if not exists "uq__auth_users__tenant_id_email_not_null" on "auth_users" ("tenant_id", lower("email")) where "email" is not null;',
    );
    this.addSql(
      `create table if not exists "auth_external_identities" ("id" uuid primary key, "tenant_id" uuid not null default '00000000-0000-0000-0000-000000000000', "auth_user_id" uuid not null, "provider" varchar(32) not null, "provider_subject" varchar(191) not null, "channel" varchar(32) not null, "profile_metadata" jsonb not null default '{}'::jsonb, "email" varchar(320) null, "email_verified" boolean null, "locale" varchar(32) null, "avatar_url" varchar(2048) null, "display_name" varchar(160) null, "username" varchar(191) null, "last_authenticated_at" timestamptz null, "linked_at" timestamptz not null default now(), "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "uq__auth_external_identities__tenant_provider_subject" unique ("tenant_id", "provider", "provider_subject"), constraint "ck__auth_external_identities__provider" check ("provider" in ('telegram', 'discord')), constraint "ck__auth_external_identities__channel" check ("channel" in ('telegram_web_login', 'telegram_tma', 'telegram_bot', 'discord_oauth', 'discord_bot')), constraint "fk__auth_external_identities__tenant_id" foreign key ("tenant_id") references "auth_tenants" ("id") on delete cascade, constraint "fk__auth_external_identities__auth_user_id" foreign key ("auth_user_id") references "auth_users" ("id") on delete cascade);`,
    );
    this.addSql(
      'create index if not exists "ix__auth_external_identities__tenant_id_auth_user_id" on "auth_external_identities" ("tenant_id", "auth_user_id");',
    );
    this.addSql(
      'create index if not exists "ix__auth_external_identities__provider_channel" on "auth_external_identities" ("provider", "channel");',
    );
    this.addSql(
      `create table if not exists "auth_methods" ("id" uuid primary key, "tenant_id" uuid not null default '00000000-0000-0000-0000-000000000000', "auth_user_id" uuid not null, "method" varchar(32) not null, "amr" jsonb not null default '[]'::jsonb, "external_identity_id" uuid null, "last_used_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "ck__auth_methods__method" check ("method" in ('password', 'telegram_web_login', 'telegram_tma', 'telegram_bot', 'discord_oauth', 'discord_bot')), constraint "fk__auth_methods__tenant_id" foreign key ("tenant_id") references "auth_tenants" ("id") on delete cascade, constraint "fk__auth_methods__auth_user_id" foreign key ("auth_user_id") references "auth_users" ("id") on delete cascade, constraint "fk__auth_methods__external_identity_id" foreign key ("external_identity_id") references "auth_external_identities" ("id") on delete cascade);`,
    );
    this.addSql(
      'create index if not exists "ix__auth_methods__tenant_id_auth_user_id" on "auth_methods" ("tenant_id", "auth_user_id");',
    );
    this.addSql(
      'create index if not exists "ix__auth_methods__tenant_id_auth_user_id_last_used_at" on "auth_methods" ("tenant_id", "auth_user_id", "last_used_at" desc);',
    );
    this.addSql(
      'create unique index if not exists "uq__auth_methods__password_per_user" on "auth_methods" ("tenant_id", "auth_user_id") where "method" = \'password\';',
    );
    this.addSql(
      'create unique index if not exists "uq__auth_methods__external_identity" on "auth_methods" ("tenant_id", "external_identity_id", "method") where "external_identity_id" is not null;',
    );
    this.addSql(
      `insert into "auth_methods" ("id", "tenant_id", "auth_user_id", "method", "amr", "last_used_at") select gen_random_uuid(), "tenant_id", "id", 'password', '["pwd"]'::jsonb, nullif("last_login_at", 'epoch'::timestamptz) from "auth_users" where coalesce("password_hash", '') <> '' on conflict do nothing;`,
    );
    this.addSql(
      `create table if not exists "auth_link_tokens" ("id" uuid primary key, "tenant_id" uuid not null default '00000000-0000-0000-0000-000000000000', "auth_user_id" uuid null, "provider" varchar(32) not null, "purpose" varchar(16) not null, "token_hash" varchar(128) not null, "nonce" varchar(191) null, "deep_link_metadata" jsonb not null default '{}'::jsonb, "expires_at" timestamptz not null, "consumed_at" timestamptz null, "revoked_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "uq__auth_link_tokens__token_hash" unique ("token_hash"), constraint "ck__auth_link_tokens__provider" check ("provider" in ('telegram', 'discord')), constraint "ck__auth_link_tokens__purpose" check ("purpose" in ('login', 'link')), constraint "fk__auth_link_tokens__tenant_id" foreign key ("tenant_id") references "auth_tenants" ("id") on delete cascade, constraint "fk__auth_link_tokens__auth_user_id" foreign key ("auth_user_id") references "auth_users" ("id") on delete cascade);`,
    );
    this.addSql(
      'create index if not exists "ix__auth_link_tokens__tenant_id_auth_user_id" on "auth_link_tokens" ("tenant_id", "auth_user_id");',
    );
    this.addSql(
      'create index if not exists "ix__auth_link_tokens__expires_at" on "auth_link_tokens" ("expires_at");',
    );
    this.addSql(
      `create table if not exists "auth_provider_tokens" ("id" uuid primary key, "tenant_id" uuid not null default '00000000-0000-0000-0000-000000000000', "auth_user_id" uuid not null, "external_identity_id" uuid not null, "provider" varchar(32) not null default 'discord', "token_kind" varchar(16) not null, "ciphertext" text not null, "iv" varchar(64) not null, "auth_tag" varchar(64) not null, "key_id" varchar(128) not null, "scopes" jsonb not null default '[]'::jsonb, "expires_at" timestamptz null, "revoked_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), constraint "ck__auth_provider_tokens__provider" check ("provider" in ('discord')), constraint "ck__auth_provider_tokens__token_kind" check ("token_kind" in ('access', 'refresh')), constraint "fk__auth_provider_tokens__tenant_id" foreign key ("tenant_id") references "auth_tenants" ("id") on delete cascade, constraint "fk__auth_provider_tokens__auth_user_id" foreign key ("auth_user_id") references "auth_users" ("id") on delete cascade, constraint "fk__auth_provider_tokens__external_identity_id" foreign key ("external_identity_id") references "auth_external_identities" ("id") on delete cascade);`,
    );
    this.addSql(
      'create index if not exists "ix__auth_provider_tokens__tenant_id_auth_user_id" on "auth_provider_tokens" ("tenant_id", "auth_user_id");',
    );
    this.addSql(
      'create index if not exists "ix__auth_provider_tokens__external_identity_id" on "auth_provider_tokens" ("external_identity_id");',
    );
    this.addSql(
      'create index if not exists "ix__auth_provider_tokens__expires_at" on "auth_provider_tokens" ("expires_at");',
    );
  }

  override down(): void {
    this.addSql('drop table if exists "auth_provider_tokens";');
    this.addSql('drop table if exists "auth_link_tokens";');
    this.addSql('drop table if exists "auth_methods";');
    this.addSql('drop table if exists "auth_external_identities";');
    this.addSql(
      'drop index if exists "uq__auth_users__tenant_id_email_not_null";',
    );
    this.addSql('alter table "auth_users" alter column "email" set not null;');
  }
}
