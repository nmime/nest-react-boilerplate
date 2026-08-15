import { Migration } from '@mikro-orm/migrations';
import { tenantRowLevelSecurityDownSql } from '@app/backend-common-tenant-policy';

/** Versioned notification templates, audience segments, and durable broadcast orchestration. */
export class Migration20260721160000AdminNotificationBroadcasts extends Migration {
  override up(): void {
    this.addSql(`
      alter table "notification_templates"
        add column if not exists "tenant_id" uuid null,
        add column if not exists "name" varchar(160),
        add column if not exists "source" varchar(16) not null default 'code',
        add column if not exists "status" varchar(16) not null default 'published',
        add column if not exists "current_version_id" uuid null,
        add column if not exists "created_by" varchar(160) null,
        add column if not exists "updated_by" varchar(160) null;
      update "notification_templates" set "name" = "code" where "name" is null or "name" = '';
      alter table "notification_templates" alter column "name" set not null;
      alter table "notification_templates" drop constraint if exists "ck__notification_templates__source";
      alter table "notification_templates" add constraint "ck__notification_templates__source"
        check ("source" in ('code', 'admin'));
      alter table "notification_templates" drop constraint if exists "ck__notification_templates__status";
      alter table "notification_templates" add constraint "ck__notification_templates__status"
        check ("status" in ('draft', 'published', 'archived'));
      alter table "notification_templates" drop constraint if exists "ck__notification_templates__tenant";
      alter table "notification_templates" add constraint "ck__notification_templates__tenant"
        check (("source" = 'code' and "tenant_id" is null) or ("source" = 'admin' and "tenant_id" is not null));
    `);

    this.addSql(`
      create table if not exists "notification_template_versions" (
        "id" uuid not null,
        "template_id" uuid not null,
        "version" int not null,
        "variables_schema" jsonb not null default '{}'::jsonb,
        "published_at" timestamptz null,
        "published_by" varchar(160) null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__notification_template_versions" primary key ("id"),
        constraint "uq__notification_template_versions__template_id__version" unique ("template_id", "version"),
        constraint "fk__notification_template_versions__template_id" foreign key ("template_id")
          references "notification_templates" ("id") on delete cascade,
        constraint "ck__notification_template_versions__version" check ("version" > 0)
      );
      create index if not exists "ix__notification_template_versions__template_id"
        on "notification_template_versions" ("template_id");
      insert into "notification_template_versions" ("id", "template_id", "version", "published_at")
        select gen_random_uuid(), t."id", 1, now()
        from "notification_templates" t
        where not exists (select 1 from "notification_template_versions" v where v."template_id" = t."id");
      update "notification_templates" t set "current_version_id" = v."id"
        from "notification_template_versions" v
        where v."template_id" = t."id" and v."version" = 1 and t."current_version_id" is null;
    `);

    this.addSql(`
      create table if not exists "notification_template_version_channels" (
        "id" uuid not null,
        "template_version_id" uuid not null,
        "channel" varchar(32) not null,
        "engine" varchar(50) not null default 'string-format',
        "content" jsonb not null,
        "created_at" timestamptz not null default now(),
        constraint "pk__notification_template_version_channels" primary key ("id"),
        constraint "uq__notification_template_version_channels__version__channel"
          unique ("template_version_id", "channel"),
        constraint "fk__notification_template_version_channels__version" foreign key ("template_version_id")
          references "notification_template_versions" ("id") on delete cascade,
        constraint "ck__notification_template_version_channels__channel"
          check ("channel" in ('bot', 'email', 'push', 'in_app')),
        constraint "ck__notification_template_version_channels__engine"
          check ("engine" in ('string-format', 'eta'))
      );
      create index if not exists "ix__notification_template_version_channels__template_version_id"
        on "notification_template_version_channels" ("template_version_id");
      insert into "notification_template_version_channels"
        ("id", "template_version_id", "channel", "engine", "content", "created_at")
        select gen_random_uuid(), t."current_version_id", c."channel", c."engine", c."content", c."created_at"
        from "notification_template_channels" c
        join "notification_templates" t on t."id" = c."template_id"
        on conflict ("template_version_id", "channel") do nothing;
      drop table "notification_template_channels";
      alter table "notification_templates" drop constraint if exists "fk__notification_templates__current_version_id";
      alter table "notification_templates" add constraint "fk__notification_templates__current_version_id"
        foreign key ("current_version_id") references "notification_template_versions" ("id") on delete restrict;
    `);

    this.addSql(`
      create table "notification_segments" (
        "id" uuid not null, "tenant_id" uuid not null, "name" varchar(160) not null,
        "kind" varchar(16) not null default 'static', "resolver_key" varchar(128) null,
        "parameters" jsonb not null default '{}'::jsonb, "status" varchar(16) not null default 'active',
        "member_count" int not null default 0, "created_by" varchar(160) not null,
        "updated_by" varchar(160) not null, "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__notification_segments" primary key ("id"),
        constraint "ck__notification_segments__kind" check ("kind" in ('static', 'dynamic')),
        constraint "ck__notification_segments__status" check ("status" in ('active', 'archived')),
        constraint "ck__notification_segments__resolver" check
          (("kind" = 'static' and "resolver_key" is null) or ("kind" = 'dynamic' and "resolver_key" is not null)),
        constraint "ck__notification_segments__member_count" check ("member_count" >= 0)
      );
      create unique index "uq__notification_segments__tenant_id_lower_name"
        on "notification_segments" ("tenant_id", lower("name")) where "status" = 'active';
      create index "ix__notification_segments__tenant_id_status" on "notification_segments" ("tenant_id", "status");

      create table "notification_segment_members" (
        "id" uuid not null, "segment_id" uuid not null, "target_type" varchar(32) not null default 'user',
        "target_id" varchar(320) not null, "language" varchar(16) null,
        "variables" jsonb not null default '{}'::jsonb, "created_at" timestamptz not null default now(),
        constraint "pk__notification_segment_members" primary key ("id"),
        constraint "fk__notification_segment_members__segment" foreign key ("segment_id")
          references "notification_segments" ("id") on delete cascade,
        constraint "uq__notification_segment_members__segment__target" unique ("segment_id", "target_type", "target_id"),
        constraint "ck__notification_segment_members__target_type"
          check ("target_type" in ('user', 'email', 'push-token', 'telegram-chat', 'system-telegram-chat'))
      );
      create index "ix__notification_segment_members__segment_id_id" on "notification_segment_members" ("segment_id", "id");

      create table "notification_segment_uploads" (
        "id" uuid not null, "segment_id" uuid not null, "object_key" varchar(512) not null,
        "checksum" varchar(64) not null, "status" varchar(16) not null default 'pending',
        "total_rows" int not null default 0, "valid_rows" int not null default 0,
        "duplicate_rows" int not null default 0, "invalid_rows" int not null default 0,
        "errors" jsonb not null default '[]'::jsonb,
        "claimed_at" timestamptz not null default '1970-01-01 00:00:00+00',
        "created_by" varchar(160) not null, "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__notification_segment_uploads" primary key ("id"),
        constraint "fk__notification_segment_uploads__segment" foreign key ("segment_id")
          references "notification_segments" ("id") on delete cascade,
        constraint "uq__notification_segment_uploads__segment__checksum" unique ("segment_id", "checksum"),
        constraint "ck__notification_segment_uploads__status"
          check ("status" in ('pending', 'processing', 'completed', 'failed'))
      );
      create index "ix__notification_segment_uploads__status_created_at"
        on "notification_segment_uploads" ("status", "created_at");
    `);

    this.addSql(`
      create table "notification_broadcasts" (
        "id" uuid not null, "tenant_id" uuid not null, "name" varchar(160) not null,
        "template_version_id" uuid not null, "channel" varchar(32) not null,
        "provider" varchar(32) not null, "priority" smallint not null default 0,
        "status" varchar(16) not null default 'draft', "scheduled_at" timestamptz null,
        "global_variables" jsonb not null default '{}'::jsonb,
        "snapshot_count" int not null default 0, "queued_count" int not null default 0,
        "sent_count" int not null default 0, "rejected_count" int not null default 0,
        "error_count" int not null default 0, "pending_count" int not null default 0,
        "cancelled_count" int not null default 0, "materialized_at" timestamptz null,
        "created_by" varchar(160) not null, "approved_by" varchar(160) null,
        "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(),
        constraint "pk__notification_broadcasts" primary key ("id"),
        constraint "fk__notification_broadcasts__template_version" foreign key ("template_version_id")
          references "notification_template_versions" ("id") on delete restrict,
        constraint "ck__notification_broadcasts__channel" check ("channel" in ('bot', 'email', 'push')),
        constraint "ck__notification_broadcasts__provider" check
          ("provider" in ('telegram-bot', 'discord-bot', 'resend', 'mailpace', 'google-fcm', 'apple-apns')),
        constraint "ck__notification_broadcasts__priority" check ("priority" between 0 and 10),
        constraint "ck__notification_broadcasts__status" check
          ("status" in ('draft', 'collecting', 'ready', 'scheduled', 'sending', 'paused', 'completed', 'cancelled', 'failed'))
      );
      create index "ix__notification_broadcasts__tenant_id_status_created_at"
        on "notification_broadcasts" ("tenant_id", "status", "created_at");
      create index "ix__notification_broadcasts__status_scheduled_at"
        on "notification_broadcasts" ("status", "scheduled_at");

      create table "notification_broadcast_segments" (
        "id" uuid not null, "broadcast_id" uuid not null, "segment_id" uuid not null,
        constraint "pk__notification_broadcast_segments" primary key ("id"),
        constraint "fk__notification_broadcast_segments__broadcast" foreign key ("broadcast_id")
          references "notification_broadcasts" ("id") on delete cascade,
        constraint "fk__notification_broadcast_segments__segment" foreign key ("segment_id")
          references "notification_segments" ("id") on delete restrict,
        constraint "uq__notification_broadcast_segments__broadcast__segment" unique ("broadcast_id", "segment_id")
      );

      create table "notification_audience_snapshots" (
        "id" uuid not null, "broadcast_id" uuid not null, "snapshot_at" timestamptz not null,
        "status" varchar(16) not null default 'created', "resolved_count" int not null default 0,
        "distinct_count" int not null default 0, "duplicate_count" int not null default 0,
        "conflict_count" int not null default 0, "invalid_count" int not null default 0,
        "error" jsonb null, "claimed_at" timestamptz not null default '1970-01-01 00:00:00+00',
        "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(),
        constraint "pk__notification_audience_snapshots" primary key ("id"),
        constraint "fk__notification_audience_snapshots__broadcast" foreign key ("broadcast_id")
          references "notification_broadcasts" ("id") on delete cascade,
        constraint "ck__notification_audience_snapshots__status"
          check ("status" in ('created', 'collecting', 'completed', 'failed'))
      );
      create index "ix__notification_audience_snapshots__status_created_at"
        on "notification_audience_snapshots" ("status", "created_at");

      create table "notification_audience_snapshot_members" (
        "id" uuid not null, "snapshot_id" uuid not null, "target_type" varchar(32) not null default 'user',
        "target_id" varchar(320) not null, "language" varchar(16) null,
        "variables" jsonb not null default '{}'::jsonb, "materialized_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        constraint "pk__notification_audience_snapshot_members" primary key ("id"),
        constraint "fk__notification_audience_snapshot_members__snapshot" foreign key ("snapshot_id")
          references "notification_audience_snapshots" ("id") on delete cascade,
        constraint "uq__notification_audience_snapshot_members__snapshot__target"
          unique ("snapshot_id", "target_type", "target_id"),
        constraint "ck__notification_audience_snapshot_members__target_type"
          check ("target_type" in ('user', 'email', 'push-token', 'telegram-chat', 'system-telegram-chat'))
      );
      create index "ix__notification_audience_snapshot_members__snapshot___ee4357c2"
        on "notification_audience_snapshot_members" ("snapshot_id", "materialized_at", "id");

      create table "notification_broadcast_commands" (
        "id" uuid not null, "broadcast_id" uuid not null, "action" varchar(32) not null,
        "idempotency_key" varchar(160) not null, "actor_id" varchar(160) not null,
        "created_at" timestamptz not null default now(),
        constraint "pk__notification_broadcast_commands" primary key ("id"),
        constraint "fk__notification_broadcast_commands__broadcast" foreign key ("broadcast_id")
          references "notification_broadcasts" ("id") on delete cascade,
        constraint "uq__notification_broadcast_commands__broadcast__action__key"
          unique ("broadcast_id", "action", "idempotency_key")
      );
    `);

    this.addSql(`
      alter table "notifications" add column if not exists "template_version_id" uuid not null
        default '00000000-0000-0000-0000-000000000000';
      alter table "notifications" add column if not exists "broadcast_id" uuid not null
        default '00000000-0000-0000-0000-000000000000';
      update "notifications" n set "template_version_id" = t."current_version_id"
        from "notification_templates" t where t."id" = n."template_id";
      alter table "notifications" alter column "template_version_id" drop default;
      update "notifications" set "broadcast_id" = null
        where "broadcast_id" = '00000000-0000-0000-0000-000000000000';
      alter table "notifications" alter column "broadcast_id" drop default;
      alter table "notifications" alter column "broadcast_id" drop not null;
      alter table "notifications" add constraint "fk__notifications__template_version_id"
        foreign key ("template_version_id") references "notification_template_versions" ("id") on delete restrict;
      alter table "notifications" add constraint "fk__notifications__broadcast_id"
        foreign key ("broadcast_id") references "notification_broadcasts" ("id") on delete restrict;
      create index "ix__notifications__template_version_id" on "notifications" ("template_version_id");
      create index "ix__notifications__broadcast_id" on "notifications" ("broadcast_id");
      create unique index "uq__notifications__broadcast_id_target_type_target_id"
        on "notifications" ("broadcast_id", "target_type", "target_id") where "broadcast_id" is not null;
      alter table "notifications" drop constraint if exists "ck__notifications__target_type";
      alter table "notifications" add constraint "ck__notifications__target_type"
        check ("target_type" in ('user', 'email', 'push-token', 'telegram-chat', 'system-telegram-chat'));

      alter table "notification_deliveries" add column if not exists "broadcast_id" uuid not null
        default '00000000-0000-0000-0000-000000000000';
      update "notification_deliveries" set "broadcast_id" = null
        where "broadcast_id" = '00000000-0000-0000-0000-000000000000';
      alter table "notification_deliveries" alter column "broadcast_id" drop default;
      alter table "notification_deliveries" alter column "broadcast_id" drop not null;
      alter table "notification_deliveries" add constraint "fk__notification_deliveries__broadcast_id"
        foreign key ("broadcast_id") references "notification_broadcasts" ("id") on delete restrict;
      create index "ix__notification_deliveries__broadcast_id_status"
        on "notification_deliveries" ("broadcast_id", "status");
      alter table "notification_deliveries" drop constraint if exists "ck__notification_deliveries__target_type";
      alter table "notification_deliveries" add constraint "ck__notification_deliveries__target_type"
        check ("target_type" in ('user', 'email', 'push-token', 'telegram-chat', 'system-telegram-chat'));
      alter table "notification_deliveries" drop constraint if exists "ck__notification_deliveries__status";
      alter table "notification_deliveries" add constraint "ck__notification_deliveries__status"
        check ("status" in ('pending', 'paused', 'sent', 'error', 'rejected', 'cancelled'));
    `);
  }

  override down(): void {
    this.addSql(
      'alter table "notification_deliveries" drop constraint if exists "fk__notification_deliveries__broadcast_id";',
    );
    this.addSql('drop index if exists "ix__notification_deliveries__broadcast_id_status";');
    this.addSql('alter table "notification_deliveries" drop column if exists "broadcast_id";');
    this.addSql('drop index if exists "uq__notifications__broadcast_id_target_type_target_id";');
    this.addSql('drop index if exists "ix__notifications__broadcast_id";');
    this.addSql('drop index if exists "ix__notifications__template_version_id";');
    this.addSql('alter table "notifications" drop constraint if exists "fk__notifications__broadcast_id";');
    this.addSql('alter table "notifications" drop constraint if exists "fk__notifications__template_version_id";');
    this.addSql('alter table "notifications" drop column if exists "broadcast_id";');
    this.addSql('alter table "notifications" drop column if exists "template_version_id";');
    this.addSql('drop table if exists "notification_broadcast_commands" cascade;');
    this.addSql('drop table if exists "notification_audience_snapshot_members" cascade;');
    this.addSql('drop table if exists "notification_audience_snapshots" cascade;');
    this.addSql('drop table if exists "notification_broadcast_segments" cascade;');
    this.addSql('drop table if exists "notification_broadcasts" cascade;');
    this.addSql('drop table if exists "notification_segment_uploads" cascade;');
    this.addSql('drop table if exists "notification_segment_members" cascade;');
    this.addSql('drop table if exists "notification_segments" cascade;');
    this.addSql(
      'alter table "notification_templates" drop constraint if exists "fk__notification_templates__current_version_id";',
    );
    this.addSql(`
      create table if not exists "notification_template_channels" (
        "id" uuid not null, "template_id" uuid not null, "channel" varchar(32) not null,
        "engine" varchar(50) not null default 'string-format', "content" jsonb not null,
        "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(),
        constraint "pk__notification_template_channels" primary key ("id"),
        constraint "uq__notification_template_channels__template_id__channel" unique ("template_id", "channel"),
        constraint "fk__notification_template_channels__template_id" foreign key ("template_id")
          references "notification_templates" ("id") on delete cascade
      );
      insert into "notification_template_channels" ("id", "template_id", "channel", "engine", "content", "created_at", "updated_at")
        select gen_random_uuid(), v."template_id", c."channel", c."engine", c."content", c."created_at", now()
        from "notification_template_version_channels" c
        join "notification_template_versions" v on v."id" = c."template_version_id"
        join "notification_templates" t on t."current_version_id" = v."id"
        on conflict ("template_id", "channel") do nothing;
    `);
    this.addSql('drop table if exists "notification_template_version_channels" cascade;');
    this.addSql('drop table if exists "notification_template_versions" cascade;');
    // Rolling the later RLS-reversal migration back reinstalls policies that
    // depend on tenant_id. Drop them before the column, or down({ to: 0 }) fails.
    for (const statement of tenantRowLevelSecurityDownSql('notification_templates')) {
      this.addSql(statement);
    }
    this.addSql(`alter table "notification_templates"
      drop column if exists "tenant_id", drop column if exists "name", drop column if exists "source",
      drop column if exists "status", drop column if exists "current_version_id",
      drop column if exists "created_by", drop column if exists "updated_by";`);
  }
}
