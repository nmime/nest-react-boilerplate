// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type pg from "pg";

import {
  DefaultTenantId,
  buildSeedUsers,
  permissionUuids,
  rolePermissions,
  roleUuids,
  userUuids,
} from "./seed-data.ts";
import { resolveRbacIds, seed } from "./postgres-seed.ts";

const adminSeedId = userUuids[0];
const migratedAdminRole = "ac17784c-ac05-44c1-a2ab-6febca67b6f8";
const migratedUserRole = "6cb9599d-a1d6-4946-9643-98c5ead11059";
const manualAdminUser = "96309181-379c-4888-a04d-8586359a0f7b";

interface RecordedQuery {
  text: string;
  values: unknown[];
}

/**
 * Records every query and emulates just enough of the auth schema (unique
 * constraints + ON CONFLICT DO NOTHING semantics) to exercise the seed flow.
 */
class FakePostgres {
  readonly queries: RecordedQuery[] = [];
  private readonly roleRows: Array<{ id: string; tenantId: string; key: string }> = [];
  private readonly permissionRows: Array<{ id: string; key: string }> = [];
  private readonly rolePermissionKeys = new Set<string>();
  private readonly userRows: Array<{ id: string; tenantId: string; email: string }> = [];
  private readonly userRoleKeys = new Set<string>();
  committed = 0;
  rolledBack = 0;

  addRole(id: string, key: string) {
    this.roleRows.push({ id, tenantId: DefaultTenantId, key });
  }

  addPermission(id: string, key: string) {
    this.permissionRows.push({ id, key });
  }

  addUser(id: string, email: string) {
    this.userRows.push({ id, tenantId: DefaultTenantId, email });
  }

  addUserRole(authUserId: string, roleId: string) {
    this.userRoleKeys.add(`${authUserId}:${roleId}:${DefaultTenantId}`);
  }

  addRolePermission(roleId: string, permissionId: string) {
    this.rolePermissionKeys.add(`${roleId}:${permissionId}`);
  }

  roleIds(): string[] {
    return this.roleRows.map((row) => row.id);
  }

  permissionIds(): string[] {
    return this.permissionRows.map((row) => row.id);
  }

  userIds(): string[] {
    return this.userRows.map((row) => row.id);
  }

  grantCount(): number {
    return this.userRoleKeys.size;
  }

  rolePermissionCount(): number {
    return this.rolePermissionKeys.size;
  }

  async connect() {}

  async end() {}

  async query(text: string, values: readonly unknown[] = []) {
    this.queries.push({ text, values: [...values] });
    const sql = text.replace(/\s+/gu, " ");
    if (sql === "BEGIN") return { rows: [] };
    if (sql === "COMMIT") {
      this.committed += 1;
      return { rows: [] };
    }
    if (sql === "ROLLBACK") {
      this.rolledBack += 1;
      return { rows: [] };
    }
    if (sql.includes("information_schema.tables")) {
      const tables = [
        "auth_role_permissions",
        "auth_roles",
        "auth_user_roles",
        "auth_users",
        "auth_permissions",
      ];
      return { rows: tables.map((table_name) => ({ table_name })) };
    }
    if (sql.includes('FROM "auth_roles"')) {
      const tenantId = String(values[0]);
      return {
        rows: this.roleRows
          .filter((row) => row.tenantId === tenantId)
          .map((row) => ({ id: row.id, key: row.key })),
      };
    }
    if (sql.includes('FROM "auth_permissions"')) {
      return { rows: this.permissionRows.map((row) => ({ id: row.id, key: row.key })) };
    }
    if (sql.includes('INSERT INTO "auth_permissions"')) {
      const [id, key] = values as [string, string];
      if (this.permissionRows.some((row) => row.key === key)) return { rowCount: 0 };
      this.permissionRows.push({ id, key });
      return { rowCount: 1 };
    }
    if (sql.includes('INSERT INTO "auth_roles"')) {
      const [id, tenantId, key] = values as [string, string, string];
      if (this.roleRows.some((row) => row.tenantId === tenantId && row.key === key)) {
        return { rowCount: 0 };
      }
      this.roleRows.push({ id, tenantId, key });
      return { rowCount: 1 };
    }
    if (sql.includes('INSERT INTO "auth_role_permissions"')) {
      const [roleId, permissionId] = values as [string, string];
      const key = `${roleId}:${permissionId}`;
      if (this.rolePermissionKeys.has(key)) return { rowCount: 0 };
      this.rolePermissionKeys.add(key);
      return { rowCount: 1 };
    }
    if (sql.includes('INSERT INTO "auth_users"')) {
      const [id, tenantId, email] = values as [string, string, string];
      const normalized = String(email).toLowerCase();
      if (
        this.userRows.some(
          (row) => row.tenantId === tenantId && row.email.toLowerCase() === normalized,
        )
      ) {
        return { rowCount: 0 };
      }
      this.userRows.push({ id, tenantId, email: String(email) });
      return { rowCount: 1 };
    }
    if (sql.includes('FROM "auth_users"')) {
      const [tenantId, email] = values as [string, string];
      const normalized = String(email).toLowerCase();
      return {
        rows: this.userRows
          .filter((row) => row.tenantId === tenantId && row.email.toLowerCase() === normalized)
          .map((row) => ({ id: row.id })),
      };
    }
    if (sql.includes('INSERT INTO "auth_user_roles"')) {
      const [authUserId, roleId, tenantId] = values as [string, string, string];
      const key = `${authUserId}:${roleId}:${tenantId}`;
      if (this.userRoleKeys.has(key)) return { rowCount: 0 };
      this.userRoleKeys.add(key);
      return { rowCount: 1 };
    }
    throw new Error(`FakePostgres: unhandled query: ${sql}`);
  }
}

function seedCalls(database: FakePostgres, fragment: string): RecordedQuery[] {
  return database.queries.filter((query) => query.text.includes(fragment));
}

/** Populates the fake with freshly-migrated RBAC state (gen_random_uuid() ids). */
function populateMigratedState(database: FakePostgres) {
  const roleIds: Record<string, string> = {
    admin: migratedAdminRole,
    user: migratedUserRole,
  };
  for (const [key, id] of Object.entries(roleIds)) database.addRole(id, key);
  const permissionIds: Record<string, string> = {};
  Object.keys(permissionUuids).forEach((key, index) => {
    const id = `44444444-0000-0000-0000-${String(index + 1).padStart(12, "0")}`;
    permissionIds[key] = id;
    database.addPermission(id, key);
  });
  for (const [roleKey, permissionKeys] of Object.entries(rolePermissions)) {
    for (const permissionKey of permissionKeys) {
      database.addRolePermission(roleIds[roleKey]!, permissionIds[permissionKey]!);
    }
  }
  return { roleIds, permissionIds };
}

describe("resolveRbacIds", () => {
  it("reuses ids the database already assigned and falls back to canonical UUIDs for missing keys", () => {
    const resolved = resolveRbacIds(
      [{ id: migratedAdminRole, key: "admin" }],
      [{ id: "11111111-1111-1111-1111-111111111111", key: "profile:read" }],
      [{ key: "user" }, { key: "admin" }],
      [{ key: "profile:read" }, { key: "admin:dashboard:read" }],
    );
    assert.deepEqual(resolved, {
      roles: {
        user: roleUuids.user,
        admin: migratedAdminRole,
      },
      permissions: {
        "profile:read": "11111111-1111-1111-1111-111111111111",
        "admin:dashboard:read": permissionUuids["admin:dashboard:read"],
      },
    });
  });

  it("drops expected keys that exist in neither the database nor the canonical UUID table", () => {
    const resolved = resolveRbacIds([], [], [{ key: "ghost" }, { key: "user" }], []);
    assert.deepEqual(resolved, { roles: { user: roleUuids.user }, permissions: {} });
  });

  it("ignores rows without a key", () => {
    const resolved = resolveRbacIds(
      [{ id: "22222222-2222-2222-2222-222222222222", key: "" }],
      [],
      [{ key: "admin" }],
      [],
    );
    assert.deepEqual(resolved, { roles: { admin: roleUuids.admin }, permissions: {} });
  });
});

describe("postgres seed", () => {
  it("reuses migration-assigned RBAC ids on a freshly migrated database", async () => {
    const database = new FakePostgres();
    populateMigratedState(database);

    const counts = await seed(database as unknown as pg.Client, buildSeedUsers("Local@Pass1!"));

    assert.deepEqual(counts, { permissions: 0, roles: 0, rolePermissions: 0, users: 3, userRoles: 3 });
    assert.equal(database.committed, 1);
    assert.equal(database.rolledBack, 0);
    // No RBAC row was re-inserted under canonical ids.
    assert.deepEqual(database.roleIds().sort(), [migratedAdminRole, migratedUserRole].sort());
    // Every grant references the ids the migration actually assigned.
    for (const call of seedCalls(database, 'INSERT INTO "auth_role_permissions"')) {
      assert.ok(
        database.roleIds().includes(String(call.values[0])),
        `role_id not in migrated roles: ${call.values[0]}`,
      );
      assert.ok(
        database.permissionIds().includes(String(call.values[1])),
        `permission_id not in migrated permissions: ${call.values[1]}`,
      );
    }
    // Grants target the resolved user ids.
    const grantUserIds = seedCalls(database, 'INSERT INTO "auth_user_roles"').map(
      (call) => call.values[0],
    );
    assert.deepEqual(grantUserIds.sort(), userUuids.slice().sort());
  });

  it("inserts canonical UUIDs when RBAC rows are missing", async () => {
    const database = new FakePostgres();
    const users = buildSeedUsers("Local@Pass1!");

    const counts = await seed(database as unknown as pg.Client, users);

    assert.deepEqual(counts, {
      permissions: Object.keys(permissionUuids).length,
      roles: 2,
      rolePermissions: Object.values(rolePermissions).flat().length,
      users: users.length,
      userRoles: users.length,
    });
    // Roles and permissions were created under the canonical seed-data UUIDs.
    const roleInserts = seedCalls(database, 'INSERT INTO "auth_roles"');
    assert.deepEqual(
      roleInserts.map((call) => call.values[0]).sort(),
      Object.values(roleUuids).sort(),
    );
    const permissionInserts = seedCalls(database, 'INSERT INTO "auth_permissions"');
    assert.deepEqual(
      permissionInserts.map((call) => call.values[0]).sort(),
      Object.values(permissionUuids).sort(),
    );
    for (const call of seedCalls(database, 'INSERT INTO "auth_role_permissions"')) {
      assert.ok(Object.values(roleUuids).includes(String(call.values[0])));
      assert.ok(Object.values(permissionUuids).includes(String(call.values[1])));
    }
  });

  it("grants roles to the pre-existing user row when the email already exists under another id", async () => {
    const database = new FakePostgres();
    database.addRole(migratedAdminRole, "admin");
    database.addRole(migratedUserRole, "user");
    // Manually created admin: same email as the seed admin, different uuid,
    // already granted both roles.
    database.addUser(manualAdminUser, "admin@example.com");
    database.addUserRole(manualAdminUser, migratedAdminRole);
    database.addUserRole(manualAdminUser, migratedUserRole);

    const counts = await seed(database as unknown as pg.Client, buildSeedUsers("Local@Pass1!"));

    assert.equal(counts.users, 2, "only the non-conflicting seed users are inserted");
    assert.equal(counts.userRoles, 2, "the existing admin grant is not duplicated");
    const grants = seedCalls(database, 'INSERT INTO "auth_user_roles"');
    const adminGrant = grants.find((call) => String(call.values[1]) === migratedAdminRole);
    assert.ok(adminGrant, "an admin role grant is attempted");
    assert.equal(
      adminGrant!.values[0],
      manualAdminUser,
      "grant targets the resolved user id, not the fixed seed id",
    );
    for (const call of grants) {
      assert.notEqual(call.values[0], adminSeedId, "no grant may target the fixed seed admin id");
    }
    assert.deepEqual(
      database.userIds().sort(),
      [manualAdminUser, userUuids[1], userUuids[2]].sort(),
    );
  });

  it("is idempotent: a second run reports zero inserts and commits cleanly", async () => {
    const database = new FakePostgres();
    const users = buildSeedUsers("Local@Pass1!");

    const first = await seed(database as unknown as pg.Client, users);
    const second = await seed(database as unknown as pg.Client, users);

    assert.deepEqual(first, {
      permissions: Object.keys(permissionUuids).length,
      roles: 2,
      rolePermissions: Object.values(rolePermissions).flat().length,
      users: 3,
      userRoles: 3,
    });
    assert.deepEqual(second, { permissions: 0, roles: 0, rolePermissions: 0, users: 0, userRoles: 0 });
    assert.equal(database.committed, 2);
    assert.equal(database.rolledBack, 0);
    // Stable state: no duplicates in any table.
    assert.equal(database.userIds().length, 3);
    assert.equal(database.grantCount(), 3);
    assert.equal(database.rolePermissionCount(), 13);
    const userInsert = seedCalls(database, 'INSERT INTO "auth_users"')[0];
    assert.ok(!userInsert.text.includes('"roles"'), "removed jsonb column must not be written");
    assert.ok(
      !userInsert.text.includes('"permissions"'),
      "removed jsonb column must not be written",
    );
    assert.ok(
      userInsert.text.includes(
        'ON CONFLICT ("tenant_id", (lower("email"::text))) WHERE "email" IS NOT NULL DO NOTHING',
      ),
      "user insert must conflict on the per-tenant unique email index",
    );
  });
});
