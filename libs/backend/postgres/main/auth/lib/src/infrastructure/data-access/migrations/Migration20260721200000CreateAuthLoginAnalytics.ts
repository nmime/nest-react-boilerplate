import { Migration } from '@mikro-orm/migrations';

export class Migration20260721200000CreateAuthLoginAnalytics extends Migration {
  override up(): void {
    this.addSql(`
      create table "auth_login_events" (
        "id" uuid not null,
        "tenant_id" uuid not null default '00000000-0000-0000-0000-000000000000',
        "user_id" uuid null,
        "identifier_hash" varchar(64) null,
        "session_id" varchar(128) null,
        "event_type" varchar(32) not null,
        "outcome" varchar(16) not null,
        "provider" varchar(32) not null,
        "channel" varchar(64) not null,
        "failure_code" varchar(64) null,
        "ip_address" varchar(45) null,
        "ip_hash" varchar(64) null,
        "country_code" varchar(2) null,
        "region" varchar(128) null,
        "city" varchar(128) null,
        "timezone" varchar(64) null,
        "timezone_source" varchar(16) null,
        "language" varchar(35) null,
        "language_source" varchar(16) null,
        "user_agent" varchar(512) null,
        "request_id" varchar(128) null,
        "occurred_at" timestamptz not null default now(),
        "network_anonymized_at" timestamptz null,
        constraint "pk__auth_login_events" primary key ("id"),
        constraint "ck__auth_login_events__event_type" check ("event_type" in ('login', 'registration')),
        constraint "ck__auth_login_events__outcome" check ("outcome" in ('success', 'failure'))
      );
    `);
    this.addSql(
      'create index "ix__auth_login_events__tenant_id_occurred_at" on "auth_login_events" ("tenant_id", "occurred_at");',
    );
    this.addSql(
      'create index "ix__auth_login_events__tenant_id_user_id_occurred_at" on "auth_login_events" ("tenant_id", "user_id", "occurred_at");',
    );
    this.addSql(
      'create index "ix__auth_login_events__tenant_id_outcome_occurred_at" on "auth_login_events" ("tenant_id", "outcome", "occurred_at");',
    );
    this.addSql(
      'create index "ix__auth_login_events__tenant_id_country_code_occurred_at" on "auth_login_events" ("tenant_id", "country_code", "occurred_at");',
    );
    this.addSql(
      'create index "ix__auth_login_events__tenant_id_language_occurred_at" on "auth_login_events" ("tenant_id", "language", "occurred_at");',
    );
    this.addSql(
      'create index "ix__auth_login_events__tenant_id_timezone_occurred_at" on "auth_login_events" ("tenant_id", "timezone", "occurred_at");',
    );
  }

  override down(): void {
    this.addSql('drop table if exists "auth_login_events" cascade;');
  }
}
