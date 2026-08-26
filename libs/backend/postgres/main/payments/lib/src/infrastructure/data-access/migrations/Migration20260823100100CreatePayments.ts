import { Migration } from '@mikro-orm/migrations';

export class Migration20260823100100CreatePayments extends Migration {
  override up(): void {
    this.addSql(`
      create table "payments" (
        "id" uuid not null,
        "tenant_id" uuid not null,
        "provider_code" text not null,
        "provider_payment_id" text null,
        "status" text not null,
        "amount" text not null,
        "currency" text not null,
        "fx_snapshot" jsonb null,
        "provider_status_raw" text null,
        "paid_amount" text null,
        "paid_currency" text null,
        "fee" text null,
        "partial_amount" text null,
        "refunded_amount" text not null default '0',
        "meta" jsonb not null default '{}'::jsonb,
        "expires_at" timestamptz null,
        "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now(),
        "paid_at" timestamptz null,
        "cancelled_at" timestamptz null,
        "expired_at" timestamptz null,
        "refunded_at" timestamptz null,
        "version" integer not null default 1,
        constraint "pk__payments" primary key ("id"),
        constraint "ck__payments__status" check ("status" in ('pending','processing','paid','failed','cancelled','expired','refunded')),
        constraint "fk__payments__provider_code" foreign key ("provider_code") references "payment_providers" ("code") on delete restrict
      );
    `);
    this.addSql('create unique index "uq__payments__provider_code_id" on "payments" ("provider_code", "id");');
    this.addSql(
      'create unique index "uq__payments__provider_code_provider_payment_id" on "payments" ("provider_code", "provider_payment_id") where "provider_payment_id" is not null;',
    );
    this.addSql('create index "ix__payments__status_expires_at" on "payments" ("status", "expires_at");');
    this.addSql(
      'create index "ix__payments__tenant_id_created_at_desc" on "payments" ("tenant_id", "created_at" desc);',
    );

    this.addSql(`
      create table "payment_refunds" (
        "id" uuid not null default gen_random_uuid(),
        "payment_id" uuid not null,
        "provider_refund_id" text null,
        "amount" text not null,
        "currency" text not null,
        "status" text not null,
        "initiated_by" text null,
        "provider_evidence" jsonb null,
        "reason" text null,
        "created_at" timestamptz not null default now(),
        "confirmed_at" timestamptz null,
        constraint "pk__payment_refunds" primary key ("id"),
        constraint "ck__payment_refunds__status" check ("status" in ('requested','confirmed','failed','manual')),
        constraint "fk__payment_refunds__payment_id" foreign key ("payment_id") references "payments" ("id") on delete cascade
      );
    `);
  }

  override down(): void {
    this.addSql('drop table if exists "payment_refunds" cascade;');
    this.addSql('drop table if exists "payments" cascade;');
  }
}
