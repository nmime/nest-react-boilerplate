// @ts-nocheck
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("./migrations-rollback-check.ts", import.meta.url),
  "utf8",
);

describe("db migrations rollback check", () => {
  it("uses the MikroORM v7 migrator property API", () => {
    assert.match(source, /const migrator = orm\.migrator;/);
    assert.doesNotMatch(source, /getMigrator\s*\(/);
    assert.doesNotMatch(source, /getPendingMigrations\s*\(/);
    assert.doesNotMatch(source, /getExecutedMigrations\s*\(/);
  });

  it("keeps the rollback check scoped to a disposable Testcontainers database", () => {
    assert.match(source, /new PostgreSqlContainer\("postgres:16-alpine"\)\.start\(\)/);
    assert.match(source, /DATABASE_URL: container\.getConnectionUri\(\)/);
    assert.match(source, /POSTGRES_SSL: "false"/);
    assert.match(source, /await migrator\.down\(\{ to: 0 \}\)/);
  });
});
