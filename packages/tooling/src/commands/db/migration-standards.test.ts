// @requirements REQ-RUNTIME-DATABASE-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalIndexName } from "./migration-index-name.ts";
import { collectMigrationStandardErrors } from "./migration-standards.ts";

describe("migration standards", () => {
  it("accepts the online nullable-add, backfill, set-not-null pattern", () => {
    const sql = [
      "this.addSql('alter table \"payment_webhook_receipts\" add column \"claimed_at\" timestamptz null;');",
      "this.addSql('update \"payment_webhook_receipts\" set \"claimed_at\" = \"received_at\" where \"claimed_at\" is null;');",
      "this.addSql('alter table \"payment_webhook_receipts\" alter column \"claimed_at\" set default now(), alter column \"claimed_at\" set not null;');",
    ].join("\n");

    assert.deepEqual(collectMigrationStandardErrors(sql), []);
  });

  it("rejects a column the migration leaves nullable", () => {
    const errors = collectMigrationStandardErrors('alter table "orders" add column "note" text null;');

    assert.equal(errors.length, 1);
    assert.match(errors[0] ?? "", /ADD COLUMN must define the column as NOT NULL/u);
  });

  it("rejects a nullable column converged on another table", () => {
    const sql = [
      'alter table "orders" add column "note" text null;',
      'alter table "invoices" alter column "note" set not null;',
    ].join("\n");

    assert.match(collectMigrationStandardErrors(sql)[0] ?? "", /ADD COLUMN must define the column as NOT NULL/u);
  });

  it("accepts a column declared NOT NULL in the ADD COLUMN itself", () => {
    assert.deepEqual(collectMigrationStandardErrors('alter table "orders" add column "note" text not null;'), []);
  });

  it("rejects enum types and accepts varchar plus a check constraint", () => {
    assert.match(
      collectMigrationStandardErrors("create type status as enum ('a','b');")[0] ?? "",
      /ENUM types are not allowed/u,
    );
    assert.deepEqual(
      collectMigrationStandardErrors(
        'alter table "orders" add column "status" varchar(20) not null constraint "ck__orders__status" check ("status" in (\'a\',\'b\'));',
      ),
      [],
    );
  });

  it("rejects an index whose name is not the canonical derivation", () => {
    const expected = canonicalIndexName({ unique: false, table: "orders", columns: "created_at" });
    const errors = collectMigrationStandardErrors('create index "orders_created_idx" on "orders" ("created_at");');

    assert.match(errors[0] ?? "", new RegExp(`index must be named ${expected}`, "u"));
  });

  it("rejects foreign key and check constraint names that break the naming contract", () => {
    const foreignKey = collectMigrationStandardErrors(
      'alter table "orders" add column "user_id" uuid not null constraint "orders_user" foreign key ("user_id") references "users" ("id");',
    );
    const check = collectMigrationStandardErrors(
      "alter table \"orders\" add column \"status\" varchar(20) not null constraint \"status_ok\" check (\"status\" <> '');",
    );

    assert.match(foreignKey[0] ?? "", /foreign key name must match/u);
    assert.match(check[0] ?? "", /check constraint name must match/u);
  });
});
