import { Migration } from "@mikro-orm/migrations";

export class Migration20260609100000CreateFeatureFlags extends Migration {
  override up(): void {
    this.addSql(`
      create table "feature_flags" (
        "id" uuid not null,
        "tenant_id" uuid not null default '00000000-0000-0000-0000-000000000000',
        "key" varchar(160) not null,
        "value" jsonb not null default 'false'::jsonb,
        "description" text not null default '',
        "enabled" boolean not null default true,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__feature_flags" primary key ("id"),
        constraint "uq__feature_flags__tenant_id_key" unique ("tenant_id", "key"),
        constraint "ck__feature_flags__key" check ("key" ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$')
      );
    `);
    this.addSql(
      'create index "ix__feature_flags__tenant_id" on "feature_flags" ("tenant_id");',
    );
  }

  override down(): void {
    this.addSql('drop table if exists "feature_flags" cascade;');
  }
}
