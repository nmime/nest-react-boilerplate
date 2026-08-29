// @requirements REQ-NOTIFY-AUDIENCE-004 REQ-NOTIFY-PERSISTENCE-005
import { describe, expect, it } from 'vitest';
import { Migration20260715100000CreateNotifications } from './Migration20260715100000CreateNotifications';
import { Migration20260720130000AddNotificationDeliveryClaim } from './Migration20260720130000AddNotificationDeliveryClaim';
import { Migration20260721120000NotificationProvidersAndSensitivePayload } from './Migration20260721120000NotificationProvidersAndSensitivePayload';
import { Migration20260721160000AdminNotificationBroadcasts } from './Migration20260721160000AdminNotificationBroadcasts';
import { Migration20260726180000NotificationClaimTokens } from './Migration20260726180000NotificationClaimTokens';
import {
  Migration20260729190000NotificationDeliveryClaimOwnership,
  Migration20260826190000NotificationTenantOwnership,
  notificationMigrations,
} from './index';

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

  it('adds opaque ownership and unknown-outcome columns in a new ordered migration', () => {
    const migration = new Migration20260729190000NotificationDeliveryClaimOwnership(
      undefined as never,
      undefined as never,
    );
    const upSql = collectSql(migration, () => {
      migration.up();
    });
    expect(upSql).toContain(
      `add column if not exists "claim_token" uuid not null default '00000000-0000-0000-0000-000000000000'::uuid`,
    );
    expect(upSql).toContain(
      `add column if not exists "dispatch_started_at" timestamptz not null default '1970-01-01 00:00:00+00'`,
    );
    expect(upSql).toContain('"ix__notification_deliveries__claim_token"');
    expect(notificationMigrations.indexOf(Migration20260726180000NotificationClaimTokens)).toBeLessThan(
      notificationMigrations.indexOf(Migration20260729190000NotificationDeliveryClaimOwnership),
    );

    const downSql = collectSql(migration, () => {
      migration.down();
    });
    expect(downSql).toContain('drop column if exists "dispatch_started_at"');
    expect(downSql).not.toContain('drop column if exists "claim_token"');
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

  it('adds non-null fencing tokens after broadcast persistence exists', () => {
    const migration = new Migration20260726180000NotificationClaimTokens(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain('"claim_token" uuid not null');
    expect(sql).toContain('"materialization_claim_token" uuid not null');
    expect(notificationMigrations.indexOf(Migration20260721160000AdminNotificationBroadcasts)).toBeLessThan(
      notificationMigrations.indexOf(Migration20260726180000NotificationClaimTokens),
    );
  });

  it('backfills and requires ordinary-notification tenant ownership without enabling RLS', () => {
    const migration = new Migration20260826190000NotificationTenantOwnership(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain('add column if not exists "tenant_id"');
    expect(sql).toContain('update "notifications"');
    expect(sql).toContain('set "tenant_id"');
    expect(sql).toContain('cannot infer tenant ownership for legacy ordinary notifications');
    expect(sql).toContain('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(sql).not.toContain('set "tenant_id" = \'00000000-0000-0000-0000-000000000000\'::uuid');
    expect(sql).toContain('alter column "tenant_id" set not null');
    expect(sql).toContain('drop constraint if exists "ck__notification_templates__tenant"');
    expect(sql).toContain('drop constraint if exists "uq__notification_templates__code"');
    expect(sql).toContain('"uq__notification_templates__code"');
    expect(sql).toContain('"uq__notification_templates__tenant_id_code"');
    expect(sql).toContain('"ix__notifications__tenant_id_created_at_desc"');
    expect(sql).not.toContain('enable row level security');
    expect(notificationMigrations.indexOf(Migration20260729190000NotificationDeliveryClaimOwnership)).toBeLessThan(
      notificationMigrations.indexOf(Migration20260826190000NotificationTenantOwnership),
    );
  });

  it('restores the legacy template ownership constraints only after a fail-fast compatibility guard', () => {
    const migration = new Migration20260826190000NotificationTenantOwnership(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.down();
    });

    const rollbackGuard = sql.indexOf('cannot roll back notification tenant ownership');
    const notificationIndexDrop = sql.indexOf('drop index if exists "ix__notifications__tenant_id_created_at_desc"');
    const tenantIndexDrop = sql.indexOf('drop index if exists "uq__notification_templates__tenant_id_code"');
    expect(rollbackGuard).toBeGreaterThanOrEqual(0);
    expect(notificationIndexDrop).toBeGreaterThan(rollbackGuard);
    expect(tenantIndexDrop).toBeGreaterThan(rollbackGuard);
    expect(sql).toContain('where "source" = \'code\' and "tenant_id" is not null');
    expect(sql).toContain('group by "code" having count(*) > 1');
    expect(sql).toContain('add constraint "uq__notification_templates__code" unique ("code")');
    expect(sql).toContain('add constraint "ck__notification_templates__tenant"');
    expect(sql).toContain(`("source" = 'code' and "tenant_id" is null)`);
    expect(sql).toContain('drop column if exists "tenant_id"');
  });

  it('drops reinstalled tenant policies before dropping notification_templates.tenant_id', () => {
    const migration = new Migration20260721160000AdminNotificationBroadcasts(undefined as never, undefined as never);
    const sql = collectSql(migration, () => {
      migration.down();
    });

    const policyDrop = sql.indexOf(
      'drop policy if exists "notification_templates_tenant_isolation" on "notification_templates";',
    );
    const columnDrop = sql.indexOf('drop column if exists "tenant_id"');
    expect(policyDrop).toBeGreaterThanOrEqual(0);
    expect(columnDrop).toBeGreaterThan(policyDrop);
  });
});
