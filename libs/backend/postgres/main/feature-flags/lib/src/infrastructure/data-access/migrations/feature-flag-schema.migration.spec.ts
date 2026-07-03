import { describe, expect, it } from "vitest";
import { Migration20260609100000CreateFeatureFlags } from "./Migration20260609100000CreateFeatureFlags";
import { featureFlagMigrationOptions, featureFlagMigrations } from "./index";

describe("feature flag migrations", () => {
  it("creates a tenant-scoped persistent feature_flags table", () => {
    const migration = new Migration20260609100000CreateFeatureFlags();
    const sql: string[] = [];
    migration.addSql = (query: string) => {
      sql.push(query);
    };

    migration.up();

    const joined = sql.join("\n");
    expect(joined).toContain('create table "feature_flags"');
    expect(joined).toContain('"tenant_id" uuid not null');
    expect(joined).toContain('"value" jsonb not null');
    expect(joined).toContain('constraint "uq__feature_flags__tenant_id_key"');
    expect(joined).toContain('constraint "ck__feature_flags__key"');
    expect(joined).toContain('create index "ix__feature_flags__tenant_id"');
  });

  it("registers the migration for tooling", () => {
    expect(featureFlagMigrations).toEqual([
      Migration20260609100000CreateFeatureFlags,
    ]);
    expect(featureFlagMigrationOptions.migrationsList).toEqual([
      Migration20260609100000CreateFeatureFlags,
    ]);
  });
});
