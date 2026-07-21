import { Migration } from '@mikro-orm/migrations';

/** Makes a queued delivery's provider immutable and protects confidential template values. */
export class Migration20260721120000NotificationProvidersAndSensitivePayload extends Migration {
  override up(): void {
    this.addSql(
      `alter table "notifications" add column if not exists "sensitive_data" jsonb not null default '{}'::jsonb;`,
    );
    this.addSql('alter table "notifications" alter column "target_id" type varchar(320);');
    this.addSql('alter table "notification_deliveries" alter column "target_id" type varchar(320);');

    this.addSql('alter table "notifications" drop constraint if exists "ck__notifications__target_type";');
    this.addSql(
      `alter table "notifications" add constraint "ck__notifications__target_type" check ("target_type" in ('user', 'email', 'telegram-chat', 'system-telegram-chat'));`,
    );
    this.addSql(
      'alter table "notification_deliveries" drop constraint if exists "ck__notification_deliveries__target_type";',
    );
    this.addSql(
      `alter table "notification_deliveries" add constraint "ck__notification_deliveries__target_type" check ("target_type" in ('user', 'email', 'telegram-chat', 'system-telegram-chat'));`,
    );

    this.addSql(`update "notification_deliveries" set "provider" = case "channel"
      when 'bot' then 'telegram-bot'
      when 'email' then 'resend'
      else 'google-fcm'
    end where "provider" is null or "provider" = 'telegram';`);
    this.addSql('alter table "notification_deliveries" alter column "provider" set not null;');
    this.addSql(
      `alter table "notification_deliveries" add constraint "ck__notification_deliveries__provider"
        check ("provider" in ('telegram-bot', 'discord-bot', 'resend', 'mailpace', 'google-fcm', 'apple-apns'));`,
    );
  }

  override down(): void {
    this.addSql(
      'alter table "notification_deliveries" drop constraint if exists "ck__notification_deliveries__provider";',
    );
    this.addSql('alter table "notification_deliveries" alter column "provider" drop not null;');
    this.addSql('alter table "notifications" drop column if exists "sensitive_data";');
  }
}
