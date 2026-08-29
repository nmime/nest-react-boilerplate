import { Migration } from '@mikro-orm/migrations';

export class Migration20260823100200CreatePaymentEvents extends Migration {
  override up(): void {
    this.addSql(`
      create table "payment_events" (
        "id" bigserial not null,
        "payment_id" uuid not null,
        "type" text not null,
        "from_status" text null,
        "to_status" text null,
        "actor" text not null,
        "reason" text null,
        "provider_evidence" jsonb null,
        "request_id" text null,
        "outbox_published_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        constraint "pk__payment_events" primary key ("id"),
        constraint "ck__payment_events__type" check ("type" in ('created','state_change','webhook_received','provider_call','reconcile','refund','manual_override')),
        constraint "fk__payment_events__payment_id" foreign key ("payment_id") references "payments" ("id") on delete cascade
      );
    `);
    this.addSql(
      'create index "ix__payment_events__payment_id_created_at" on "payment_events" ("payment_id", "created_at");',
    );
    this.addSql(
      'create index "ix__payment_events__type_to_status_outbox_published_at" on "payment_events" ("type", "to_status", "outbox_published_at") where "outbox_published_at" is null;',
    );
  }

  override down(): void {
    this.addSql('drop table if exists "payment_events" cascade;');
  }
}
