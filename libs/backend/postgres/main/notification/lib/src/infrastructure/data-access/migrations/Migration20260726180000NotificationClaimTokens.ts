import { Migration } from '@mikro-orm/migrations';

/** Fences stale notification workers after a claim lease is reassigned. */
export class Migration20260726180000NotificationClaimTokens extends Migration {
  override up(): void {
    this.addSql(`alter table "notification_deliveries" add column "claim_token" uuid not null
      default '00000000-0000-0000-0000-000000000000';`);
    this.addSql(`alter table "notification_segment_uploads" add column "claim_token" uuid not null
      default '00000000-0000-0000-0000-000000000000';`);
    this.addSql(`alter table "notification_audience_snapshots" add column "claim_token" uuid not null
      default '00000000-0000-0000-0000-000000000000';`);
    this.addSql(`alter table "notification_broadcasts"
      add column "materialization_claimed_at" timestamptz not null default '1970-01-01 00:00:00+00',
      add column "materialization_claim_token" uuid not null
        default '00000000-0000-0000-0000-000000000000';`);
    this
      .addSql(`create index "ix__notification_broadcasts__status_materialized_at_materialization_claimed_at_updated_at"
      on "notification_broadcasts" ("status", "materialized_at", "materialization_claimed_at", "updated_at");`);
  }

  override down(): void {
    this.addSql(
      'drop index if exists "ix__notification_broadcasts__status_materialized_at_materialization_claimed_at_updated_at";',
    );
    this.addSql(`alter table "notification_broadcasts"
      drop column "materialization_claimed_at", drop column "materialization_claim_token";`);
    this.addSql('alter table "notification_audience_snapshots" drop column "claim_token";');
    this.addSql('alter table "notification_segment_uploads" drop column "claim_token";');
    this.addSql('alter table "notification_deliveries" drop column "claim_token";');
  }
}
