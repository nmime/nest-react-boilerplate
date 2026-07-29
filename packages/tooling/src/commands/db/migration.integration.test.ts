// @ts-nocheck
/**
 * Integration tests for unified auth migration (migrate.ts + better-auth-schema.ts).
 *
 * Spins up a disposable PostgreSQL container, runs migrations, verifies all expected
 * tables exist, then tears down. Run with: node --import @swc-node/register migration.integration.test.ts
 *
 * SKIP_INTEGRATION=1 to skip when Docker is unavailable.
 */
import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../../../../..");
const TEST_DB_SUFFIX = randomUUID().slice(0, 8);
const TEST_DB_NAME = `test_nrb_${TEST_DB_SUFFIX}`;
const TEST_CONTAINER = `nrb-migrate-test-${TEST_DB_SUFFIX}`;
const SKIP_BY_ENV = process.env.SKIP_INTEGRATION === "1";

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

async function canBindLocalPort() {
  try {
    await findFreePort();
    return true;
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (code === "EACCES" || code === "EPERM") return false;
    throw error;
  }
}

const LOCAL_BIND_AVAILABLE = SKIP_BY_ENV ? false : await canBindLocalPort();
const SKIP = SKIP_BY_ENV
  ? "SKIP_INTEGRATION=1"
  : LOCAL_BIND_AVAILABLE
    ? false
    : "local TCP port binding is unavailable in this execution environment";

function runPostgresMigrations(databaseUrl, timeout) {
  const migrateTsPath = resolve(__dirname, "migrate.ts");
  const commonI18nPath = resolve(workspaceRoot, "libs/common/i18n/runtime/lib/src/index.ts");
  const evaluate = `
    import { createJiti } from "jiti";
    const jiti = createJiti(import.meta.url, { alias: { "@app/common-i18n-runtime": ${JSON.stringify(commonI18nPath)} } });
    const { runDatabaseMigrations } = await jiti.import(${JSON.stringify(migrateTsPath)});
    await runDatabaseMigrations("postgres");
  `;
  return spawnSync(process.execPath, ["--input-type=module", "--eval", evaluate], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      AUTH_PERSISTENCE: "postgres",
      DATABASE_URL: databaseUrl,
      SWC_NODE_PROJECT: resolve(workspaceRoot, "tsconfig.base.json"),
    },
    encoding: "utf8",
    timeout,
  });
}

function runDocker(args) {
  return new Promise((resolve) => {
    const child = spawn("docker", args, { stdio: "pipe" });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d));
    child.stderr?.on("data", (d) => (stderr += d));
    child.on("close", (code) =>
      resolve({ code, stdout: stdout.toString(), stderr: stderr.toString() }),
    );
  });
}

const { Pool } = await import("pg");

describe("unified auth migration integration", { skip: SKIP }, () => {
  let dbUrl = "";
  let port = 0;

  before(async () => {
    port = await findFreePort();

    const { code: startCode } = await runDocker([
      "run",
      "-d",
      "--name",
      TEST_CONTAINER,
      "-e",
      "POSTGRES_PASSWORD=postgres",
      "-e",
      `POSTGRES_DB=${TEST_DB_NAME}`,
      "-p",
      `${port}:5432`,
      "postgres:17-alpine",
    ]);
    assert.strictEqual(startCode, 0, "Failed to start test PostgreSQL container");

    // Wait for readiness
    const startTime = Date.now();
    while (Date.now() - startTime < 30_000) {
      const pool = new Pool({
        connectionString: `postgres://postgres:postgres@127.0.0.1:${port}/${TEST_DB_NAME}`,
      });
      try {
        await pool.query("SELECT 1");
        await pool.end();
        dbUrl = `postgres://postgres:postgres@127.0.0.1:${port}/${TEST_DB_NAME}`;
        break;
      } catch {
        await pool.end().catch(() => {});
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    assert.ok(dbUrl, "PostgreSQL did not become ready within 30s");
  }, { timeout: 120_000 });

  after(async () => {
    await runDocker(["stop", "-t", "2", TEST_CONTAINER]).catch(() => {});
    await runDocker(["rm", "-f", TEST_CONTAINER]).catch(() => {});
  }, { timeout: 15_000 });

  describe("applyBetterAuthSchema (component)", () => {
    it("creates all Better-Auth core tables on fresh DB", async () => {
      const { applyBetterAuthSchema } = await import("./better-auth-schema.ts");
      const result = await applyBetterAuthSchema({ connectionString: dbUrl });
      assert.ok(result.created.includes("user"), "user table should be created");
      assert.ok(result.created.includes("session"), "session table should be created");
      assert.ok(result.created.includes("account"), "account table should be created");
      assert.ok(result.created.includes("verification"), "verification table should be created");
      assert.strictEqual(result.skipped.length, 0, "nothing should be skipped on fresh DB");
    });

    it("skips all tables on second run (idempotent)", async () => {
      const { applyBetterAuthSchema } = await import("./better-auth-schema.ts");
      const result = await applyBetterAuthSchema({ connectionString: dbUrl });
      assert.strictEqual(result.created.length, 0, "nothing should be created on second run");
      assert.ok(result.skipped.includes("user"), "user should be skipped");
      assert.ok(result.skipped.includes("session"), "session should be skipped");
      assert.ok(result.skipped.includes("account"), "account should be skipped");
      assert.ok(result.skipped.includes("verification"), "verification should be skipped");
    });

    it("creates user table with plugin columns", async () => {
      const pool = new Pool({ connectionString: dbUrl });
      try {
        const userCols = await pool.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='user' ORDER BY column_name`,
        );
        const colNames = userCols.rows.map((r) => r.column_name);
        assert.ok(colNames.includes("id"));
        assert.ok(colNames.includes("email"));
        assert.ok(colNames.includes("emailVerified"));
        assert.ok(colNames.includes("status"));
        assert.ok(!colNames.includes("roles"), "Better Auth user roles cache should not exist");
        assert.ok(!colNames.includes("permissions"), "Better Auth user permissions cache should not exist");
        assert.ok(colNames.includes("locale"));
        assert.ok(colNames.includes("theme"));
      } finally {
        await pool.end();
      }
    });
  });

  describe("full migrate.ts script (e2e)", () => {
    it("runs the unified migration script successfully", async () => {
      const result = runPostgresMigrations(dbUrl, 120_000);

      if (result.status !== 0) {
        console.error("STDOUT:", result.stdout);
        console.error("STDERR:", result.stderr);
        assert.strictEqual(result.status, 0, `Migration script exited with code ${result.status}`);
      }

      const lines = (result.stdout ?? "").split("\n");
      const jsonLine = lines.find((l) => l.startsWith('{"status":'));
      assert.ok(jsonLine, "Expected JSON summary in migration output");
      const summary = JSON.parse(jsonLine);
      assert.strictEqual(summary.status, "ok");
    }, { timeout: 120_000 });

    it("verifies all expected tables exist after migration", async () => {
      const pool = new Pool({ connectionString: dbUrl });
      try {
        const res = await pool.query(
          `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
        );
        const tables = new Set(res.rows.map((r) => r.tablename));

        // Better-Auth core
        assert.ok(tables.has("user"), "user table should exist");
        assert.ok(tables.has("session"), "session table should exist");
        assert.ok(tables.has("account"), "account table should exist");
        assert.ok(tables.has("verification"), "verification table should exist");

        // MikroORM auth tables
        assert.ok(tables.has("auth_users"), "auth_users should exist");
        assert.ok(tables.has("auth_tenants"), "auth_tenants should exist");
        assert.ok(tables.has("auth_tenant_memberships"), "auth_tenant_memberships should exist");
        assert.ok(tables.has("auth_tenant_invitations"), "auth_tenant_invitations should exist");
        assert.ok(!tables.has("auth_refresh_tokens"), "retired auth_refresh_tokens should not exist");
        assert.ok(tables.has("auth_user_tokens"), "auth_user_tokens should exist");
        assert.ok(tables.has("admin_audit_logs"), "admin_audit_logs should exist");
        assert.ok(tables.has("transactional_outbox_events"), "transactional_outbox_events should exist");
        assert.ok(tables.has("feature_flags"), "feature_flags should exist");
        assert.ok(tables.has("auth_external_identities"), "auth_external_identities should exist");
        assert.ok(tables.has("auth_methods"), "auth_methods should exist");
        assert.ok(tables.has("auth_link_tokens"), "auth_link_tokens should exist");
        assert.ok(tables.has("auth_provider_tokens"), "auth_provider_tokens should exist");
        assert.ok(tables.has("fastify_sessions"), "canonical fastify_sessions should exist");

        const authUserColumns = await pool.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='auth_users'`,
        );
        const authUserColumnNames = new Set(authUserColumns.rows.map((row) => row.column_name));
        assert.ok(!authUserColumnNames.has("roles"), "auth_users.roles legacy cache should not exist");
        assert.ok(!authUserColumnNames.has("permissions"), "auth_users.permissions legacy cache should not exist");

        // Migration tracking
        assert.ok(tables.has("mikro_orm_migrations"), "mikro_orm_migrations should exist");

        console.log(`All ${tables.size} tables present:`, [...tables].join(", "));
      } finally {
        await pool.end();
      }
    });

    it("verifies mikro_orm_migrations tracking is correct", async () => {
      const pool = new Pool({ connectionString: dbUrl });
      try {
        const res = await pool.query(
          `SELECT name FROM mikro_orm_migrations ORDER BY name`,
        );
        const names = res.rows.map((r) => r.name);
        assert.ok(names.length > 0, "At least one migration should be tracked");
        assert.ok(names.some((n) => n.includes("CreateAuthUsers")), "CreateAuthUsers should be tracked");
        assert.ok(names.some((n) => n.includes("CreateSocialAuthDataModel")), "CreateSocialAuthDataModel should be tracked");
        console.log(`${names.length} MikroORM migrations tracked`);
      } finally {
        await pool.end();
      }
    });

    it("is idempotent on second run", async () => {
      const result = runPostgresMigrations(dbUrl, 60_000);

      assert.strictEqual(result.status, 0, "Second run should succeed");
      const lines = (result.stdout ?? "").split("\n");
      const jsonLine = lines.find((l) => l.startsWith('{"status":'));
      assert.ok(jsonLine, "Expected JSON summary in second run");
      const summary = JSON.parse(jsonLine);
      assert.strictEqual(summary.status, "ok");
      console.log(`Idempotent: betterAuthSkipped=${summary.betterAuthSkipped}`);
    }, { timeout: 60_000 });
  });
}, { timeout: 180_000 });
