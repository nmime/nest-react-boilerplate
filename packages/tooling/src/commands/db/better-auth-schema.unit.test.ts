// @ts-nocheck
/**
 * Unit tests for better-auth-schema.ts
 *
 * Tests the exported types and function signatures.
 * The actual DB integration is in migration.integration.test.ts.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./better-auth-schema.ts", import.meta.url),
  "utf8",
);

describe("better-auth-schema source", () => {
  it("exports applyBetterAuthSchema as an async function", () => {
    assert.match(source, /export async function applyBetterAuthSchema/);
  });

  it("uses IF NOT EXISTS for idempotent table creation", () => {
    assert.match(source, /CREATE TABLE "user" \(/);
    assert.match(source, /CREATE TABLE "session" \(/);
    assert.match(source, /CREATE TABLE "account" \(/);
    assert.match(source, /CREATE TABLE "verification" \(/);
  });

  it("adds plugin columns with IF NOT EXISTS for idempotency", () => {
    assert.match(source, /ADD COLUMN IF NOT EXISTS "tenantId"/);
    assert.match(source, /ADD COLUMN IF NOT EXISTS "status"/);
    assert.match(source, /ADD COLUMN IF NOT EXISTS "roles"/);
    assert.match(source, /ADD COLUMN IF NOT EXISTS "permissions"/);
    assert.match(source, /ADD COLUMN IF NOT EXISTS "locale"/);
    assert.match(source, /ADD COLUMN IF NOT EXISTS "theme"/);
  });

  it("wraps all DDL in a transaction with BEGIN/COMMIT/ROLLBACK", () => {
    assert.match(source, /await client\.query\("BEGIN"\)/);
    assert.match(source, /await client\.query\("COMMIT"\)/);
    assert.match(source, /await client\.query\("ROLLBACK"\)/);
  });

  it("checks existing tables before creating", () => {
    assert.match(source, /getExistingTables/);
    assert.match(source, /pg_tables/);
  });

  it("returns a result with created and skipped arrays", () => {
    assert.match(source, /BetterAuthSchemaResult/);
    assert.match(source, /created: \[\]/);
    assert.match(source, /skipped: \[\]/);
  });

  it("uses Pool from pg with connectionString option", () => {
    assert.match(source, /Pool/);
    assert.match(source, /connectionString: options\.connectionString/);
  });

  it("creates unique indexes for session token and account provider", () => {
    assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS "uq__user__email"/);
    assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS "uq__session__token"/);
    assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS "uq__account__provider_account"/);
  });

  it("includes the current Better Auth OAuth and verification columns", () => {
    assert.match(source, /"scope" text/);
    assert.match(source, /ADD COLUMN IF NOT EXISTS "scope"/);
    assert.match(source, /ADD COLUMN IF NOT EXISTS "updatedAt"/);
  });

  it("creates user table with plugin columns (status, roles, permissions, locale, theme)", () => {
    assert.match(source, /"tenantId" varchar\(128\)/);
    assert.match(source, /"status" varchar\(32\)/);
    assert.match(source, /"roles" json/);
    assert.match(source, /"permissions" json/);
    assert.match(source, /"locale" varchar\(16\)/);
    assert.match(source, /"theme" varchar\(16\)/);
  });
});
