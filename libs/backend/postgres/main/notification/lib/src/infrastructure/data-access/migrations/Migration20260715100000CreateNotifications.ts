import type { Transaction } from '@mikro-orm/core';
import { Migration } from '@mikro-orm/migrations';

export class Migration20260715100000CreateNotifications extends Migration {
  override isTransactional(): boolean {
    return super.isTransactional();
  }
  override reset(): void {
    super.reset();
  }
  override setTransactionContext(ctx: Transaction): void {
    super.setTransactionContext(ctx);
  }

  override up(): void {
    this.addSql(`
      create table "notification_templates" (
        "id" uuid not null,
        "code" varchar(128) not null default '',
        "description" text null,
        "body" jsonb null,
        "image" jsonb null,
        "buttons" jsonb null,
        "template_engine" varchar(50) not null default 'string-format',
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
        constraint "fk__notification_template_channels__template_id" foreign key ("template_id") references "notification_templates" ("id") on delete cascade
      );
    `);
    this.addSql(
      'create index "ix__notification_template_channels__template_id" on "notification_template_channels" ("template_id");',
    );

    this.addSql(`
      create table "notifications" (
        "id" uuid not null,
        "channel" varchar(32) not null,
        "target_type" varchar(32) not null,
        "target_id" varchar(64) not null,
        "custom_template" varchar(64) null,
        "template_id" uuid null,
        "data" jsonb null,
        "extra" jsonb null,
        "in_app_visible" boolean not null default true,
        "status" varchar(32) not null,
        "error" jsonb null,
        "priority" int not null default 100,
        "send_time_from" time null,
        "send_time_to" time null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__notifications" primary key ("id"),
        constraint "fk__notifications__template_id" foreign key ("template_id") references "notification_templates" ("id") on delete set null
      );
    `);
    this.addSql('create index "ix__notifications__status" on "notifications" ("status");');
    this.addSql('create index "ix__notifications__custom_template" on "notifications" ("custom_template");');
    this.addSql('create index "ix__notifications__template_id" on "notifications" ("template_id");');
    this.addSql('create index "ix__notifications__created_at" on "notifications" ("created_at");');
    this.addSql(
      'create index "ix__notifications__status_target_type_send_time_from_send_time_to" on "notifications" ("status", "target_type", "send_time_from", "send_time_to");',
    );
    this.addSql(
      'create index "ix__notifications__target_type_target_id_in_app_visible_created_at_id" on "notifications" ("target_type", "target_id", "in_app_visible", "created_at", "id");',
    );

    this.addSql(`
      create table "notification_deliveries" (
        "id" bigserial not null,
        "notification_id" uuid not null,
        "channel" varchar(32) not null,
        "status" varchar(32) not null,
        "error" jsonb null,
        "attempts" int not null default 0,
        "provider" varchar(32) null,
        "priority" int not null default 100,
        "send_time_from" time null,
        "send_time_to" time null,
        "sent_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        constraint "pk__notification_deliveries" primary key ("id"),
        constraint "uq__notification_deliveries__notification_id__channel" unique ("notification_id", "channel", "created_at"),
        constraint "fk__notification_deliveries__notification_id" foreign key ("notification_id") references "notifications" ("id") on delete cascade
      );
    `);
    this.addSql(
      'create index "ix__notification_deliveries__status_send_time_from_send_time_to" on "notification_deliveries" ("status", "send_time_from", "send_time_to");',
    );
    this.addSql(
      'create index "ix__notification_deliveries__notification_id" on "notification_deliveries" ("notification_id");',
    );
  }

  override down(): void {
    this.addSql('drop table if exists "notification_deliveries" cascade;');
    this.addSql('drop table if exists "notifications" cascade;');
    this.addSql('drop table if exists "notification_template_channels" cascade;');
    this.addSql('drop table if exists "notification_templates" cascade;');
  }
}
