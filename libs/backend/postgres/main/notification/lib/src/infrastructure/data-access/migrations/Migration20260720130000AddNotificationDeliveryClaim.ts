import { Migration } from '@mikro-orm/migrations';

export class Migration20260720130000AddNotificationDeliveryClaim extends Migration {
  override up(): void {
    // Delivery-claim lease marker used by findPendingDeliveries' FOR UPDATE SKIP
    // LOCKED claim so concurrent workers/replicas never dispatch the same delivery.
    // NOT NULL with the epoch sentinel default: existing rows are "unclaimed" and
    // therefore immediately eligible. ADD COLUMN on the partitioned parent cascades
    // to every partition.
    this.addSql(
      `alter table "notification_deliveries" add column if not exists "claimed_at" timestamptz not null default '1970-01-01 00:00:00+00';`,
    );
  }

  override down(): void {
    this.addSql('alter table "notification_deliveries" drop column if exists "claimed_at";');
  }
}
