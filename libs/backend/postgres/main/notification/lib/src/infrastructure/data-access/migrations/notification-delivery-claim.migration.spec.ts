// @requirements REQ-NOTIFY-PERSISTENCE-005
import { describe, expect, it } from 'vitest';
import { Migration20260715100000CreateNotifications } from './Migration20260715100000CreateNotifications';
import { Migration20260720130000AddNotificationDeliveryClaim } from './Migration20260720130000AddNotificationDeliveryClaim';
import { Migration20260721120000NotificationProvidersAndSensitivePayload } from './Migration20260721120000NotificationProvidersAndSensitivePayload';
import { Migration20260721160000AdminNotificationBroadcasts } from './Migration20260721160000AdminNotificationBroadcasts';
import { notificationMigrations } from './index';

function collectSql(migration: { addSql(sql: string): void }, run: () => void): string {
  const statements: string[] = [];
  migration.addSql = (sql: string) => statements.push(sql);
  run();
  return statements.join('\n');
}

describe('Notification delivery-claim migration', () => {
  it('adds a NOT NULL claimed_at lease column defaulting to the epoch sentinel', () => {
    const migration = new Migration20260720130000AddNotificationDeliveryClaim(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain(
      `alter table "notification_deliveries" add column if not exists "claimed_at" timestamptz not null default '1970-01-01 00:00:00+00';`,
    );
  });

  it('drops the claimed_at column on rollback', () => {
    const migration = new Migration20260720130000AddNotificationDeliveryClaim(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.down();
    });

    expect(sql).toContain('alter table "notification_deliveries" drop column if exists "claimed_at";');
  });

  it('runs after the notifications table is created', () => {
    expect(notificationMigrations.indexOf(Migration20260715100000CreateNotifications)).toBeLessThan(
      notificationMigrations.indexOf(Migration20260720130000AddNotificationDeliveryClaim),
    );
  });

  it('migrates legacy delivery providers and adds encrypted sensitive payload storage', () => {
    const migration = new Migration20260721120000NotificationProvidersAndSensitivePayload(
      undefined as never,
      undefined as never,
    );
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain('add column if not exists "sensitive_data" jsonb not null default \'{}\'::jsonb');
    expect(sql).toContain('drop constraint if exists "ck__notification_deliveries__provider"');
    expect(sql).toContain("when 'bot' then 'telegram-bot'");
    expect(sql).toContain('alter column "provider" set not null');
    expect(sql).toContain("'resend', 'mailpace', 'google-fcm', 'apple-apns'");
    expect(notificationMigrations.indexOf(Migration20260720130000AddNotificationDeliveryClaim)).toBeLessThan(
      notificationMigrations.indexOf(Migration20260721120000NotificationProvidersAndSensitivePayload),
    );
  });

  it('restores the base notification constraints on rollback without dropping base-owned columns', () => {
    const migration = new Migration20260721120000NotificationProvidersAndSensitivePayload(
      undefined as never,
      undefined as never,
    );
    const sql = collectSql(migration, () => {
      migration.down();
    });

    expect(sql).toContain('drop constraint if exists "ck__notifications__target_type"');
    expect(sql).toContain("'push-token', 'telegram-chat'");
    expect(sql).toContain('add constraint "ck__notification_deliveries__provider"');
    expect(sql).not.toContain('drop column if exists "sensitive_data"');
    expect(sql).not.toContain('alter column "provider" drop not null');
  });

  it('backfills immutable template versions before removing mutable channels', () => {
    const migration = new Migration20260721160000AdminNotificationBroadcasts(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain('insert into "notification_template_version_channels"');
    expect(sql).toContain('drop table "notification_template_channels"');
    expect(sql.indexOf('insert into "notification_template_version_channels"')).toBeLessThan(
      sql.indexOf('drop table "notification_template_channels"'),
    );
    expect(sql).toContain('add column if not exists "template_version_id" uuid not null');
    expect(
      notificationMigrations.indexOf(Migration20260721120000NotificationProvidersAndSensitivePayload),
    ).toBeLessThan(notificationMigrations.indexOf(Migration20260721160000AdminNotificationBroadcasts));
  });
});
