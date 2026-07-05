import { AdminRolesWritePermission } from "@app/common-authz";
import { describe, expect, it } from "vitest";
import { Migration20260704120000CreateRbacModel } from "./Migration20260704120000CreateRbacModel";
import { Migration20260704130000GrantAdminRolesWrite } from "./Migration20260704130000GrantAdminRolesWrite";
import { authMigrations } from "./index";

function collectSql(
  migration: { addSql(sql: string): void },
  run: () => void,
): string {
  const statements: string[] = [];
  migration.addSql = (sql: string) => {
    statements.push(sql);
  };
  run();

  return statements.join("\n");
}

describe("Grant admin roles:write migration", () => {
  it("idempotently grants admin -> admin:roles:write from the shared catalog", () => {
    const migration = new Migration20260704130000GrantAdminRolesWrite();
    const sql = collectSql(migration, () => {
      migration.up();
    });

    expect(sql).toContain('insert into "auth_role_permissions"');
    expect(sql).toContain(`r."key" = 'admin'`);
    expect(sql).toContain(`p."key" = '${AdminRolesWritePermission}'`);
    expect(sql).toContain("on conflict do nothing");
  });

  it("removes exactly the admin -> admin:roles:write grant on rollback", () => {
    const migration = new Migration20260704130000GrantAdminRolesWrite();
    const sql = collectSql(migration, () => {
      migration.down();
    });

    expect(sql).toContain('delete from "auth_role_permissions"');
    expect(sql).toContain(`r."key" = 'admin'`);
    expect(sql).toContain(`p."key" = '${AdminRolesWritePermission}'`);
  });

  it("registers the grant migration last, after the RBAC model migration", () => {
    expect(authMigrations[authMigrations.length - 1]).toBe(
      Migration20260704130000GrantAdminRolesWrite,
    );
    expect(
      authMigrations.indexOf(Migration20260704120000CreateRbacModel),
    ).toBeLessThan(
      authMigrations.indexOf(Migration20260704130000GrantAdminRolesWrite),
    );
  });
});
