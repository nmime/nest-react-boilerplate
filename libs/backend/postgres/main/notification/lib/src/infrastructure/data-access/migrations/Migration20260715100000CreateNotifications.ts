import { Migration } from '@mikro-orm/migrations';

/** Final notification schema for new installations; there is no legacy rollout state. */
export class Migration20260715100000CreateNotifications extends Migration {
  override up(): void {
    this.addSql(`
      create table "notification_templates" (
        "id" uuid not null,
        "code" varchar(128) not null,
        "description" text null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__notification_templates" primary key ("id"),
        constraint "uq__notification_templates__code" unique ("code")
      );
    `);

    this.addSql(`
      create table "notification_template_channels" (
        "id" uuid not null,
        "template_id" uuid not null,
        "channel" varchar(32) not null,
        "engine" varchar(50) not null default 'string-format',
        "content" jsonb not null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__notification_template_channels" primary key ("id"),
        constraint "uq__notification_template_channels__template_id__channel" unique ("template_id", "channel"),
        constraint "fk__notification_template_channels__template_id"
          foreign key ("template_id") references "notification_templates" ("id") on delete cascade,
        constraint "ck__notification_template_channels__channel"
          check ("channel" in ('bot', 'email', 'push', 'in_app')),
        constraint "ck__notification_template_channels__engine"
          check ("engine" in ('string-format', 'eta'))
      );
    `);
    this.addSql(
      'create index "ix__notification_template_channels__template_id" on "notification_template_channels" ("template_id");',
    );

    this.addSql(`
      create table "notifications" (
        "id" uuid not null,
        "target_type" varchar(32) not null,
        "target_id" varchar(64) not null,
        "template_id" uuid not null,
        "data" jsonb null,
        "extra" jsonb null,
        "in_app_visible" boolean not null default true,
        "created_at" timestamptz not null default now(),
        constraint "pk__notifications" primary key ("id"),
        constraint "fk__notifications__template_id"
          foreign key ("template_id") references "notification_templates" ("id") on delete restrict,
        constraint "ck__notifications__target_type"
          check ("target_type" in ('user', 'telegram-chat', 'system-telegram-chat'))
      );
    `);
    this.addSql('create index "ix__notifications__template_id" on "notifications" ("template_id");');
    this.addSql('create index "ix__notifications__created_at" on "notifications" ("created_at");');
    this.addSql(
      'create index "ix__notifications__target_type_target_id_in_app_visible_created_at_desc_id_desc" on "notifications" ("target_type", "target_id", "in_app_visible", "created_at" desc, "id" desc);',
    );

    this.addSql('create sequence "notification_deliveries_id_seq";');
    this.addSql(`
      create table "notification_deliveries" (
        "id" bigint not null default nextval('notification_deliveries_id_seq'),
        "notification_id" uuid not null,
        "target_type" varchar(32) not null,
        "target_id" varchar(64) not null,
        "channel" varchar(32) not null,
        "status" varchar(32) not null default 'pending',
        "error" jsonb null,
        "attempts" int not null default 0,
        "provider" varchar(32) null,
        "priority" int not null default 100,
        "send_after" timestamptz not null default now(),
        "sent_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__notification_deliveries" primary key ("id", "created_at"),
        constraint "uq__notification_deliveries__notification_id__channel"
          unique ("notification_id", "channel", "created_at"),
        constraint "ck__notification_deliveries__target_type"
          check ("target_type" in ('user', 'telegram-chat', 'system-telegram-chat')),
        constraint "ck__notification_deliveries__channel"
          check ("channel" in ('bot', 'email', 'push')),
        constraint "ck__notification_deliveries__status"
          check ("status" in ('pending', 'sent', 'error', 'rejected')),
        constraint "ck__notification_deliveries__attempts" check ("attempts" >= 0)
      ) partition by range ("created_at");
    `);
    this.addSql(
      'create index "ix__notification_deliveries__notification_id" on "notification_deliveries" ("notification_id");',
    );
    this.addSql(
      'create index "ix__notification_deliveries__target_type_status_send_after_target_id_priority_desc_id" on "notification_deliveries" ("target_type", "status", "send_after", "target_id", "priority" desc, "id");',
    );
    // Boundaries are anchored to UTC month edges so the seeded partitions line up exactly with the
    // partitions created at runtime by NotificationDeliveryPartitionService (which emits UTC/ISO bounds).
    // Using a session-timezone-dependent bound here would leave a gap or overlap at the seam on any
    // non-UTC database.
    this.addSql(`
      do $$
      declare
        month_start timestamp;
        partition_name text;
      begin
        for month_offset in 0..6 loop
          month_start := date_trunc('month', now() at time zone 'UTC') + make_interval(months => month_offset);
          partition_name := 'notification_deliveries_' || to_char(month_start, 'YYYY_MM');
          execute format(
            'create table if not exists %I partition of notification_deliveries for values from (%L) to (%L)',
            partition_name,
            month_start at time zone 'UTC',
            (month_start + interval '1 month') at time zone 'UTC'
          );
        end loop;
      end $$;
    `);
  }

  override down(): void {
    this.addSql('drop table if exists "notification_deliveries" cascade;');
    this.addSql('drop sequence if exists "notification_deliveries_id_seq";');
    this.addSql('drop table if exists "notifications" cascade;');
    this.addSql('drop table if exists "notification_template_channels" cascade;');
    this.addSql('drop table if exists "notification_templates" cascade;');
  }
}
