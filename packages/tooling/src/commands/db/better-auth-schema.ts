/**
 * Better-Auth core schema migration.
 *
 * Creates/verifies Better-Auth's core tables: user, session, account, verification.
 * Uses IF NOT EXISTS / conditional ALTER for idempotent runs.
 *
 * Returns { created: string[], skipped: string[] } so callers can report progress.
 */
import { type PoolClient, Pool } from "pg";

export interface BetterAuthSchemaResult {
  created: string[];
  skipped: string[];
}

export interface BetterAuthSchemaOptions {
  connectionString: string;
}

export async function applyBetterAuthSchema(
  options: BetterAuthSchemaOptions,
): Promise<BetterAuthSchemaResult> {
  const pool = new Pool({ connectionString: options.connectionString });
  const client = await pool.connect();
  const result: BetterAuthSchemaResult = { created: [], skipped: [] };

  try {
    await client.query("BEGIN");

    // Check existing tables
    const existingTables = await getExistingTables(client);

    // ─── user ──────────────────────────────────────────────────────
    if (existingTables.has("user")) {
      result.skipped.push("user");
    } else {
      await client.query(`
        CREATE TABLE "user" (
          "id" varchar(128) PRIMARY KEY,
          "email" varchar(320) NOT NULL,
          "emailVerified" boolean NOT NULL DEFAULT false,
          "name" varchar(160) NOT NULL DEFAULT '',
          "image" varchar(2048),
          "password_hash" varchar(255),
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      result.created.push("user");
    }

    // Plugin-added columns on user table
    const userColumns = await getColumns(client, "user");
    const pluginColumns = [
      { name: "status", sql: `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "status" varchar(32) NOT NULL DEFAULT 'active'` },
      { name: "roles", sql: `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "roles" json NOT NULL DEFAULT '[]'` },
      { name: "permissions", sql: `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "permissions" json NOT NULL DEFAULT '[]'` },
      { name: "locale", sql: `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "locale" varchar(16) NOT NULL DEFAULT 'en'` },
      { name: "theme", sql: `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "theme" varchar(16) NOT NULL DEFAULT 'system'` },
    ];
    for (const col of pluginColumns) {
      if (!userColumns.has(col.name)) {
        await client.query(col.sql);
        result.created.push(`user.${col.name}`);
      } else {
        result.skipped.push(`user.${col.name}`);
      }
    }

    // ─── session ────────────────────────────────────────────────────
    if (existingTables.has("session")) {
      result.skipped.push("session");
    } else {
      await client.query(`
        CREATE TABLE "session" (
          "id" varchar(128) PRIMARY KEY,
          "userId" varchar(128) NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          "expiresAt" timestamptz NOT NULL,
          "token" varchar(128) NOT NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now(),
          "ipAddress" varchar(45),
          "userAgent" varchar(512)
        )
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "uq__session__token"
          ON "session" ("token")
      `);
      result.created.push("session");
    }

    // ─── account ────────────────────────────────────────────────────
    if (existingTables.has("account")) {
      result.skipped.push("account");
    } else {
      await client.query(`
        CREATE TABLE "account" (
          "id" varchar(128) PRIMARY KEY,
          "userId" varchar(128) NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
          "accountId" varchar(191) NOT NULL,
          "providerId" varchar(32) NOT NULL,
          "accessToken" text,
          "refreshToken" text,
          "idToken" text,
          "accessTokenExpiresAt" timestamptz,
          "refreshTokenExpiresAt" timestamptz,
          "password" varchar(255),
          "createdAt" timestamptz NOT NULL DEFAULT now(),
          "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "uq__account__provider_account"
          ON "account" ("providerId", "accountId")
      `);
      result.created.push("account");
    }

    // ─── verification ──────────────────────────────────────────────
    if (existingTables.has("verification")) {
      result.skipped.push("verification");
    } else {
      await client.query(`
        CREATE TABLE "verification" (
          "id" varchar(128) PRIMARY KEY,
          "identifier" varchar(256) NOT NULL,
          "value" text NOT NULL,
          "expiresAt" timestamptz NOT NULL,
          "createdAt" timestamptz NOT NULL DEFAULT now()
        )
      `);
      result.created.push("verification");
    }

    await client.query("COMMIT");
    return result;
  } catch (err: unknown) {
    await client.query("ROLLBACK").catch(() => {});
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[better-auth-schema] Migration failed: ${message}`);
  } finally {
    client.release();
    await pool.end();
  }
}

async function getExistingTables(client: PoolClient): Promise<Set<string>> {
  const res = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  return new Set(res.rows.map((r) => r.tablename as string));
}

async function getColumns(client: PoolClient, tableName: string): Promise<Set<string>> {
  const res = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [tableName],
  );
  return new Set(res.rows.map((r) => r.column_name as string));
}
