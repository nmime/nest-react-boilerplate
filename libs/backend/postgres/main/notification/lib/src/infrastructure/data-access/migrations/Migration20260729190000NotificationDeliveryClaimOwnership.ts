import { Migration } from '@mikro-orm/migrations';

export class Migration20260729190000NotificationDeliveryClaimOwnership extends Migration {
  override up(): void {
    this.addSql(
      `alter table "notification_deliveries" add column if not exists "claim_token" uuid not null default '00000000-0000-0000-0000-000000000000'::uuid;`,
    );
    this.addSql(
      `alter table "notification_deliveries" add column if not exists "dispatch_started_at" timestamptz not null default '1970-01-01 00:00:00+00';`,
    );
    this.addSql(
      'create index if not exists "ix__notification_deliveries__claim_token" on "notification_deliveries" ("claim_token");',
    );
  }

  override down(): void {
    this.addSql('drop index if exists "ix__notification_deliveries__claim_token";');
    this.addSql('alter table "notification_deliveries" drop column if exists "dispatch_started_at";');
    this.addSql('alter table "notification_deliveries" drop column if exists "claim_token";');
  }
}
