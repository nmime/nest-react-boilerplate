import { Migration } from '@mikro-orm/migrations';

export class Migration20260823100300CreatePaymentWebhookReceipts extends Migration {
  override up(): void {
    this.addSql(`
      create table "payment_webhook_receipts" (
        "id" uuid not null default gen_random_uuid(),
        "provider_code" text not null,
        "idempotency_key" text not null,
        "raw_body" text not null,
        "content_type" text null,
        "signature_valid" text not null,
        "signature_kind" text null,
        "status_code" integer null,
        "processing_status" text not null default 'pending',
        "error" text null,
        "request_id" text null,
        "received_at" timestamptz not null default now(),
        "processed_at" timestamptz null,
        constraint "pk__payment_webhook_receipts" primary key ("id"),
        constraint "uq__payment_webhook_receipts__provider_code_idempotency_key" unique ("provider_code", "idempotency_key"),
        constraint "ck__payment_webhook_receipts__signature_valid" check ("signature_valid" in ('valid','invalid','none')),
        constraint "ck__payment_webhook_receipts__processing_status" check ("processing_status" in ('pending','applied','ignored','rejected','error'))
      );
    `);
    this.addSql(
      'create index "ix__payment_webhook_receipts__processing_status_received_at" on "payment_webhook_receipts" ("processing_status", "received_at");',
    );
  }

  override down(): void {
    this.addSql('drop table if exists "payment_webhook_receipts" cascade;');
  }
}
