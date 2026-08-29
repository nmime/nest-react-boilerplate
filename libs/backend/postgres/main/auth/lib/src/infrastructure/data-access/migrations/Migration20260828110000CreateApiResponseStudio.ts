import { Migration } from '@mikro-orm/migrations';

export class Migration20260828110000CreateApiResponseStudio extends Migration {
  override up(): void {
    this.addSql(
      `alter table "problem_presentation_overrides" drop constraint if exists "ck__problem_presentation_overrides__display";`,
    );
    this.addSql(
      `alter table "problem_presentation_overrides" add constraint "ck__problem_presentation_overrides__display" check ("display" in ('toast','modal','custom','silent'));`,
    );
    this.addSql(
      `alter table "problem_presentation_overrides" add column if not exists "message_zh" text not null default '', add column if not exists "texts_en" jsonb not null default '[]'::jsonb, add column if not exists "texts_ru" jsonb not null default '[]'::jsonb, add column if not exists "texts_zh" jsonb not null default '[]'::jsonb, add column if not exists "support" boolean not null default false, add column if not exists "custom_description" text not null default '', add column if not exists "figma_only" boolean not null default false;`,
    );
    this.addSql(
      `update "problem_presentation_overrides" set "texts_en" = case when "message_en" = '' then '[]'::jsonb else jsonb_build_array("message_en") end where "texts_en" = '[]'::jsonb;`,
    );
    this.addSql(
      `update "problem_presentation_overrides" set "texts_ru" = case when "message_ru" = '' then '[]'::jsonb else jsonb_build_array("message_ru") end where "texts_ru" = '[]'::jsonb;`,
    );
    this.addSql(`create table "api_response_studio_sources" (
      "id" uuid not null, "tenant_id" uuid not null, "name" varchar(200) not null, "slug" varchar(100) not null, "json_url" text not null, "docs_url" text not null default '', "enabled" boolean not null default true, "manual_only" boolean not null default true, "revision" integer not null default 1,
      "last_sync_at" timestamptz null, "last_sync_status" varchar(16) not null default 'never', "last_sync_error" text not null default '', "last_sync_summary" jsonb null, "created_by_user_id" uuid not null, "updated_by_user_id" uuid not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(),
      constraint "pk__api_response_studio_sources" primary key ("id"), constraint "uq__api_response_studio_sources__tenant_slug" unique ("tenant_id","slug"), constraint "ck__api_response_studio_sources__revision" check ("revision" >= 1), constraint "ck__api_response_studio_sources__sync_status" check ("last_sync_status" in ('never','success','failed')),
      constraint "fk__api_response_studio_sources__tenant" foreign key ("tenant_id") references "auth_tenants"("id") on delete cascade, constraint "fk__api_response_studio_sources__created_user" foreign key ("created_by_user_id") references "auth_users"("id") on delete restrict, constraint "fk__api_response_studio_sources__updated_user" foreign key ("updated_by_user_id") references "auth_users"("id") on delete restrict);`);
    this.addSql(
      `create index "ix__api_response_studio_sources__tenant_id_enabled" on "api_response_studio_sources" ("tenant_id","enabled");`,
    );
    this.addSql(`create table "api_response_studio_responses" (
      "id" uuid not null, "tenant_id" uuid not null, "source_id" uuid not null, "stable_key" varchar(1000) not null, "tag" varchar(200) not null default '', "method" varchar(16) not null, "path" varchar(1000) not null, "operation_id" varchar(300) not null default '', "summary" text not null default '', "status" varchar(16) not null, "error_type" varchar(200) not null default '', "description" text not null default '',
      "schema_snapshot" text not null default '', "example_snapshot" text not null default '', "enum_choices" jsonb not null default '[]'::jsonb, "change_state" varchar(16) not null default 'new', "change_dismissed" boolean not null default false, "deleted" boolean not null default false, "source_fingerprint" varchar(64) not null,
      "display" varchar(16) not null default 'toast', "severity" varchar(16) not null default 'error', "support" boolean not null default false, "custom_description" text not null default '', "figma_only" boolean not null default false, "comments" text not null default '', "texts" jsonb not null default '{"en":[],"ru":[],"zh":[]}'::jsonb,
      "revision" integer not null default 1, "updated_by_user_id" uuid not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(),
      constraint "pk__api_response_studio_responses" primary key ("id"), constraint "uq__api_response_studio_responses__tenant_source_key" unique ("tenant_id","source_id","stable_key"),
      constraint "ck__api_response_studio_responses__method" check ("method" in ('GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD','TRACE')), constraint "ck__api_response_studio_responses__change" check ("change_state" in ('unchanged','new','modified','deleted')), constraint "ck__api_response_studio_responses__display" check ("display" in ('toast','modal','custom','silent')), constraint "ck__api_response_studio_responses__severity" check ("severity" in ('error','warning','info','success')), constraint "ck__api_response_studio_responses__revision" check ("revision" >= 1),
      constraint "fk__api_response_studio_responses__tenant" foreign key ("tenant_id") references "auth_tenants"("id") on delete cascade, constraint "fk__api_response_studio_responses__source" foreign key ("source_id") references "api_response_studio_sources"("id") on delete cascade, constraint "fk__api_response_studio_responses__updated_user" foreign key ("updated_by_user_id") references "auth_users"("id") on delete restrict);`);
    this.addSql(
      `create index "ix__api_response_studio_responses__tenant_id_source_id_path" on "api_response_studio_responses" ("tenant_id","source_id","path"); create index "ix__api_response_studio_responses__tenant_id_change_s__1788d913" on "api_response_studio_responses" ("tenant_id","change_state","change_dismissed"); create index "ix__api_response_studio_responses__tenant_id_deleted" on "api_response_studio_responses" ("tenant_id","deleted");`,
    );
    this.addSql(`create table "api_response_studio_history" (
      "id" uuid not null, "tenant_id" uuid not null, "source_id" uuid null, "response_id" uuid null, "action" varchar(128) not null, "actor_user_id" uuid not null, "before" jsonb not null default '{}'::jsonb, "after" jsonb not null default '{}'::jsonb, "metadata" jsonb not null default '{}'::jsonb, "created_at" timestamptz not null default now(),
      constraint "pk__api_response_studio_history" primary key ("id"), constraint "fk__api_response_studio_history__tenant" foreign key ("tenant_id") references "auth_tenants"("id") on delete cascade, constraint "fk__api_response_studio_history__source" foreign key ("source_id") references "api_response_studio_sources"("id") on delete set null, constraint "fk__api_response_studio_history__response" foreign key ("response_id") references "api_response_studio_responses"("id") on delete set null, constraint "fk__api_response_studio_history__actor" foreign key ("actor_user_id") references "auth_users"("id") on delete restrict);`);
    this.addSql(
      `create index "ix__api_response_studio_history__tenant_id_created_at_desc" on "api_response_studio_history" ("tenant_id","created_at" desc); create index "ix__api_response_studio_history__tenant_id_source_id___c3c7c7b9" on "api_response_studio_history" ("tenant_id","source_id","created_at" desc); create index "ix__api_response_studio_history__tenant_id_response_i__8f4d4e26" on "api_response_studio_history" ("tenant_id","response_id","created_at" desc);`,
    );
  }

  override down(): void {
    this.addSql(
      'drop table if exists "api_response_studio_history" cascade; drop table if exists "api_response_studio_responses" cascade; drop table if exists "api_response_studio_sources" cascade;',
    );
    this.addSql(
      'alter table "problem_presentation_overrides" drop column if exists "message_zh", drop column if exists "texts_en", drop column if exists "texts_ru", drop column if exists "texts_zh", drop column if exists "support", drop column if exists "custom_description", drop column if exists "figma_only";',
    );
    this.addSql(
      `alter table "problem_presentation_overrides" drop constraint if exists "ck__problem_presentation_overrides__display"; alter table "problem_presentation_overrides" add constraint "ck__problem_presentation_overrides__display" check ("display" in ('toast','silent'));`,
    );
  }
}
