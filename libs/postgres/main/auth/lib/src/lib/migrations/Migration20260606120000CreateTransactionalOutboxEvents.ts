import { Migration } from "@mikro-orm/migrations";

export class Migration20260606120000CreateTransactionalOutboxEvents extends Migration {
  override up(): void {
    this.addSql(
      'create table if not exists "transactional_outbox_events" ("id" uuid not null, "tenant_id" uuid not null default \'00000000-0000-0000-0000-000000000000\', "aggregate_type" varchar(128) not null, "aggregate_id" uuid not null, "event_type" varchar(128) not null, "payload" jsonb not null default \'{}\'::jsonb, "metadata" jsonb not null default \'{}\'::jsonb, "status" varchar(32) not null default \'pending\', "created_at" timestamptz not null, "published_at" timestamptz null, constraint "transactional_outbox_events_pkey" primary key ("id"));',
    );
    this.addSql(
      'create index if not exists "ix__transactional_outbox_events__tenant_status_created_at" on "transactional_outbox_events" ("tenant_id", "status", "created_at");',
    );
    this.addSql(
      'create index if not exists "ix__transactional_outbox_events__tenant_aggregate" on "transactional_outbox_events" ("tenant_id", "aggregate_type", "aggregate_id");',
    );
    this.addSql(
      'create index if not exists "ix__admin_audit_logs__tenant_created_at_id" on "admin_audit_logs" ("tenant_id", "created_at", "id");',
    );
  }

  override down(): void {
    this.addSql(
      'drop index if exists "ix__admin_audit_logs__tenant_created_at_id";',
    );
    this.addSql(
      'drop index if exists "ix__transactional_outbox_events__tenant_aggregate";',
    );
    this.addSql(
      'drop index if exists "ix__transactional_outbox_events__tenant_status_created_at";',
    );
    this.addSql('drop table if exists "transactional_outbox_events";');
  }
}
