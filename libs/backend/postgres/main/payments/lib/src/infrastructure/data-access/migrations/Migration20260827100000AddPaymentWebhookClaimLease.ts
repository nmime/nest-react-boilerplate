import { Migration } from '@mikro-orm/migrations';

export class Migration20260827100000AddPaymentWebhookClaimLease extends Migration {
  override up(): void {
    this.addSql('alter table "payment_webhook_receipts" add column "claimed_at" timestamptz null;');
    this.addSql('update "payment_webhook_receipts" set "claimed_at" = "received_at" where "claimed_at" is null;');
    this.addSql(
      'alter table "payment_webhook_receipts" alter column "claimed_at" set default now(), alter column "claimed_at" set not null;',
    );
    this.addSql('drop index if exists "ix__payment_webhook_receipts__processing_status_received_at";');
    this.addSql(
      'create index "ix__payment_webhook_receipts__processing_status_claimed_at" on "payment_webhook_receipts" ("processing_status", "claimed_at");',
    );
  }

  override down(): void {
    this.addSql('drop index if exists "ix__payment_webhook_receipts__processing_status_claimed_at";');
    this.addSql(
      'create index "ix__payment_webhook_receipts__processing_status_received_at" on "payment_webhook_receipts" ("processing_status", "received_at");',
    );
    this.addSql('alter table "payment_webhook_receipts" drop column "claimed_at";');
  }
}
