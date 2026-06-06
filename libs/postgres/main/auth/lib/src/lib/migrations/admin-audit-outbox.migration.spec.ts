import { describe, expect, it } from "vitest";
import { Migration20260605143000CreateAdminAuditLogs } from "./Migration20260605143000CreateAdminAuditLogs";
import { Migration20260606120000CreateTransactionalOutboxEvents } from "./Migration20260606120000CreateTransactionalOutboxEvents";
import { authMigrations } from "./index";

function collectSql(migration: { addSql(sql: string): void; up(): void }) {
  const statements: string[] = [];
  migration.addSql = (sql: string) => {
    statements.push(sql);
  };
  migration.up();

  return statements.join("\n");
}

describe("admin audit/outbox migrations", () => {
  it("creates the admin audit log schema with tenant indexes", () => {
    const sql = collectSql(new Migration20260605143000CreateAdminAuditLogs());

    expect(sql).toContain('create table if not exists "admin_audit_logs"');
    expect(sql).toContain('"before" jsonb not null');
    expect(sql).toContain('"after" jsonb not null');
    expect(sql).toContain('"metadata" jsonb not null');
    expect(sql).toContain('"tenant_id", "target_user_id"');
  });

  it("creates transactional outbox schema and deterministic audit ordering index", () => {
    const sql = collectSql(
      new Migration20260606120000CreateTransactionalOutboxEvents(),
    );

    expect(sql).toContain(
      'create table if not exists "transactional_outbox_events"',
    );
    expect(sql).toContain("\"status\" varchar(32) not null default 'pending'");
    expect(sql).toContain('"payload" jsonb not null');
    expect(sql).toContain('"ix__admin_audit_logs__tenant_created_at_id"');
    expect(sql).toContain('"tenant_id", "created_at", "id"');
  });

  it("registers admin audit before outbox migrations", () => {
    expect(authMigrations).toContain(
      Migration20260605143000CreateAdminAuditLogs,
    );
    expect(authMigrations).toContain(
      Migration20260606120000CreateTransactionalOutboxEvents,
    );
    expect(
      authMigrations.indexOf(Migration20260605143000CreateAdminAuditLogs),
    ).toBeLessThan(
      authMigrations.indexOf(
        Migration20260606120000CreateTransactionalOutboxEvents,
      ),
    );
  });
});
