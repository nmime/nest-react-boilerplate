import { Migration } from '@mikro-orm/migrations';

export class Migration20260823100000CreatePaymentProviders extends Migration {
  override up(): void {
    this.addSql(`
      create table "payment_providers" (
        "id" uuid not null default gen_random_uuid(),
        "code" text not null,
        "kind" text not null,
        "enabled" boolean not null default false,
        "priority" integer not null default 100,
        "tenant_id" uuid null,
        "supported_currencies" jsonb not null default '[]'::jsonb,
        "config" jsonb not null default '{}'::jsonb,
        "base_url" text not null,
        "version" text not null,
        "credentials_encrypted" jsonb null,
        "timeout_ms" integer not null default 15000,
        "region_allow" jsonb null,
        "region_deny" jsonb not null default '[]'::jsonb,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "updated_by" uuid null,
        constraint "pk__payment_providers" primary key ("id"),
        constraint "uq__payment_providers__code_tenant_id" unique ("code", "tenant_id"),
        constraint "uq__payment_providers__code" unique ("code"),
        constraint "ck__payment_providers__kind" check ("kind" in ('crypto','fiat')),
        constraint "ck__payment_providers__enabled_credentials" check (NOT "enabled" OR "credentials_encrypted" IS NOT NULL)
      );
    `);

    this.addSql(`
      create table "payment_provider_health" (
        "provider_code" text not null,
        "state" text not null default 'unknown',
        "consecutive_errors" integer not null default 0,
        "last_success_at" timestamptz null,
        "last_error_at" timestamptz null,
        "last_error_class" text null,
        "updated_at" timestamptz not null default now(),
        constraint "pk__payment_provider_health" primary key ("provider_code"),
        constraint "ck__payment_provider_health__state" check ("state" in ('unknown','up','degraded','down','disabled')),
        constraint "fk__payment_provider_health__provider_code" foreign key ("provider_code") references "payment_providers" ("code") on delete cascade
      );
    `);
  }

  override down(): void {
    this.addSql('drop table if exists "payment_provider_health" cascade;');
    this.addSql('drop table if exists "payment_providers" cascade;');
  }
}
