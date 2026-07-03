import { Migration } from "@mikro-orm/migrations";

export class Migration20260531123000AddAuthTenantLifecycle extends Migration {
  override up(): void {
    this.addSql(`
      create table if not exists "auth_tenants" (
        "id" uuid primary key,
        "slug" varchar(64) not null,
        "name" varchar(160) not null,
        "primary_domain" varchar(253) not null default '',
        "status" varchar(32) not null default 'active',
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "uq__auth_tenants__slug" unique ("slug"),
        constraint "ck__auth_tenants__status" check ("status" in ('active', 'suspended', 'deleted'))
      );
    `);
    this.addSql(`
      create unique index if not exists "uq__auth_tenants__primary_domain"
        on "auth_tenants" ("primary_domain")
        where "primary_domain" <> '';
    `);
    this.addSql(`
      insert into "auth_tenants" ("id", "slug", "name", "status")
      values ('00000000-0000-0000-0000-000000000000', 'default', 'Default tenant', 'active')
      on conflict ("id") do nothing;
    `);

    this.addSql(`
      do $$
      begin
        if not exists (
          select 1 from pg_constraint where conname = 'fk__auth_users__tenant_id'
        ) then
          alter table "auth_users"
            add constraint "fk__auth_users__tenant_id"
            foreign key ("tenant_id") references "auth_tenants" ("id");
        end if;
      end $$;
    `);

    this.addSql(`
      create table if not exists "auth_tenant_memberships" (
        "id" uuid primary key,
        "tenant_id" uuid not null,
        "user_id" uuid not null,
        "roles" jsonb not null default '["member"]'::jsonb,
        "is_default" boolean not null default false,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "uq__auth_tenant_memberships__tenant_id_user_id" unique ("tenant_id", "user_id"),
        constraint "fk__auth_tenant_memberships__tenant_id" foreign key ("tenant_id") references "auth_tenants" ("id") on delete cascade,
        constraint "fk__auth_tenant_memberships__user_id" foreign key ("user_id") references "auth_users" ("id") on delete cascade
      );
    `);
    this.addSql(
      'create index if not exists "ix__auth_tenant_memberships__user_id" on "auth_tenant_memberships" ("user_id");',
    );
    this.addSql(
      'create index if not exists "ix__auth_tenant_memberships__tenant_id" on "auth_tenant_memberships" ("tenant_id");',
    );

    this.addSql(`
      create table if not exists "auth_tenant_invitations" (
        "id" uuid primary key,
        "tenant_id" uuid not null,
        "email" varchar(320) not null,
        "roles" jsonb not null default '["member"]'::jsonb,
        "status" varchar(32) not null default 'pending',
        "token_hash" varchar(128) not null,
        "invited_by_user_id" uuid not null default '00000000-0000-0000-0000-000000000000',
        "expires_at" timestamptz not null,
        "accepted_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "uq__auth_tenant_invitations__token_hash" unique ("token_hash"),
        constraint "ck__auth_tenant_invitations__status" check ("status" in ('pending', 'accepted', 'revoked', 'expired')),
        constraint "fk__auth_tenant_invitations__tenant_id" foreign key ("tenant_id") references "auth_tenants" ("id") on delete cascade
      );
    `);
    this.addSql(
      'create index if not exists "ix__auth_tenant_invitations__tenant_id" on "auth_tenant_invitations" ("tenant_id");',
    );
    this.addSql(
      'create index if not exists "ix__auth_tenant_invitations__email" on "auth_tenant_invitations" ("email");',
    );

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
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "uq__auth_refresh_tokens__token_hash" unique ("token_hash"),
        constraint "fk__auth_refresh_tokens__tenant_id" foreign key ("tenant_id") references "auth_tenants" ("id") on delete cascade,
        constraint "fk__auth_refresh_tokens__user_id" foreign key ("user_id") references "auth_users" ("id") on delete cascade
      );
    `);
    this.addSql(
      'create index if not exists "ix__auth_refresh_tokens__tenant_id_user_id" on "auth_refresh_tokens" ("tenant_id", "user_id");',
    );
    this.addSql(
      'create index if not exists "ix__auth_refresh_tokens__family_id" on "auth_refresh_tokens" ("family_id");',
    );

    this.addSql(`
      create table if not exists "auth_user_tokens" (
        "id" uuid primary key,
        "tenant_id" uuid not null default '00000000-0000-0000-0000-000000000000',
        "user_id" uuid not null,
        "purpose" varchar(32) not null,
        "token_hash" varchar(128) not null,
        "expires_at" timestamptz not null,
        "consumed_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "uq__auth_user_tokens__token_hash" unique ("token_hash"),
        constraint "ck__auth_user_tokens__purpose" check ("purpose" in ('email_verification', 'password_reset')),
        constraint "fk__auth_user_tokens__tenant_id" foreign key ("tenant_id") references "auth_tenants" ("id") on delete cascade,
        constraint "fk__auth_user_tokens__user_id" foreign key ("user_id") references "auth_users" ("id") on delete cascade
      );
    `);
    this.addSql(
      'create index if not exists "ix__auth_user_tokens__tenant_id_user_id" on "auth_user_tokens" ("tenant_id", "user_id");',
    );
    this.addSql(
      'create index if not exists "ix__auth_user_tokens__purpose" on "auth_user_tokens" ("purpose");',
    );
  }

  override down(): void {
    this.addSql('drop table if exists "auth_user_tokens";');
    this.addSql('drop table if exists "auth_refresh_tokens";');
    this.addSql('drop table if exists "auth_tenant_invitations";');
    this.addSql('drop table if exists "auth_tenant_memberships";');
    this.addSql(
      'alter table "auth_users" drop constraint if exists "fk__auth_users__tenant_id";',
    );
    this.addSql('drop index if exists "uq__auth_tenants__primary_domain";');
    this.addSql('drop table if exists "auth_tenants";');
  }
}
