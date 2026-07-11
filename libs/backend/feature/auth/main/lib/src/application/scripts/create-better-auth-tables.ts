/**
 * Creates Better-Auth core tables in PostgreSQL.
 *
 * Run with: DATABASE_URL=... npx tsx libs/backend/feature/auth/main/lib/src/scripts/create-better-auth-tables.ts
 *
 * This is the authoritative schema for Better-Auth's core tables.
 * Better-Auth expects tables named: user, session, account, verification (singular, no prefix).
 * Column names must be camelCase to match Better-Auth's internal adapter expectations.
 * IDs are nanoid-style strings (varchar), not UUIDs.
 *
 * Idempotent: uses IF NOT EXISTS / conditional ALTER for safety.
 */
import { Pool } from 'pg';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: dbUrl });

async function run(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ─── user ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "user" (
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

    // Plugin-added columns (idempotent: skip if already exist)
    await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "status" varchar(32) NOT NULL DEFAULT 'active'`);
    await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "roles" json NOT NULL DEFAULT '[]'`);
    await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "permissions" json NOT NULL DEFAULT '[]'`);
    await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "locale" varchar(16) NOT NULL DEFAULT 'en'`);
    await client.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "theme" varchar(16) NOT NULL DEFAULT 'system'`);

    // ─── session ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "session" (
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

    // ─── account ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "account" (
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

    // ─── verification ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS "verification" (
        "id" varchar(128) PRIMARY KEY,
        "identifier" varchar(256) NOT NULL,
        "value" text NOT NULL,
        "expiresAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await client.query('COMMIT');
    console.log('[create-better-auth-tables] All Better-Auth tables created/verified successfully.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[create-better-auth-tables] Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

void run();
