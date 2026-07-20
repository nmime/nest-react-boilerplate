import { describe, expect, it } from 'vitest';
import { Migration20260715100000CreateNotifications } from './Migration20260715100000CreateNotifications';
import { Migration20260720130000AddNotificationDeliveryClaim } from './Migration20260720130000AddNotificationDeliveryClaim';
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
});
