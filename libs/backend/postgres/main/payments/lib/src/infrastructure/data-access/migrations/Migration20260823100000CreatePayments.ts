import { Migration } from '@mikro-orm/migrations';

/**
 * Scaffold migration for the payments feature.
 *
 * Creates the placeholder `payments` table the generated entity maps to. U3 replaces the
 * scaffold DDL with the four production tables (`payment_providers`, `payments`,
 * `payment_events`, `payment_webhook_receipts`) under the same timestamp family, and grows
 * the registry entry in the setup catalog with it.
 */
export class Migration20260823100000CreatePayments extends Migration {
  override up(): void {
    this.addSql(
      'create table "payments" ("id" uuid not null, "name" varchar(255) not null, "created_at" timestamptz not null, constraint "payments_pkey" primary key ("id"));',
    );
  }

  override down(): void {
    this.addSql('drop table if exists "payments" cascade;');
  }
}
