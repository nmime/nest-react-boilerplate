// @requirements REQ-RUNTIME-DATABASE-008
// Evidence for: REQ-RUNTIME-DATABASE-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  postgresIdentifierMaxBytes,
  canonicalIndexName,
  exceedsIdentifierLimit,
} from "./migration-index-name.ts";

describe("canonical migration index names", () => {
  it("keeps a short name verbatim", () => {
    assert.equal(
      canonicalIndexName({ unique: false, table: "notifications", columns: "created_at" }),
      "ix__notifications__created_at",
    );
    assert.equal(
      canonicalIndexName({ unique: true, table: "notifications", columns: "target_id" }),
      "uq__notifications__target_id",
    );
  });

  it("truncates a name PostgreSQL could not store to exactly the identifier limit", () => {
    const name = canonicalIndexName({
      unique: false,
      table: "notification_broadcasts",
      columns: "status_materialized_at_materialization_claimed_at_updated_at",
    });

    assert.equal(Buffer.byteLength(name), postgresIdentifierMaxBytes);
    assert.ok(name.startsWith("ix__notification_broadcasts__status_materialized_at"));
  });

  it("keeps truncated names distinct when only their tails differ", () => {
    const shared = "target_type_status_send_after_target_id_priority_desc";
    const first = canonicalIndexName({
      unique: false,
      table: "notification_deliveries",
      columns: `${shared}_id`,
    });
    const second = canonicalIndexName({
      unique: false,
      table: "notification_deliveries",
      columns: `${shared}_created_at`,
    });

    assert.notEqual(first, second);
    assert.equal(Buffer.byteLength(first), postgresIdentifierMaxBytes);
    assert.equal(Buffer.byteLength(second), postgresIdentifierMaxBytes);
  });

  it("is deterministic across calls", () => {
    const options = {
      unique: true,
      table: "notification_audience_snapshot_members",
      columns: "snapshot_id_materialized_at_id_and_more_columns_to_overflow",
    };

    assert.equal(canonicalIndexName(options), canonicalIndexName(options));
  });

  it("reports identifiers PostgreSQL would silently truncate", () => {
    assert.equal(exceedsIdentifierLimit("fk__notifications__target_id"), false);
    assert.equal(exceedsIdentifierLimit("a".repeat(postgresIdentifierMaxBytes)), false);
    assert.equal(exceedsIdentifierLimit("a".repeat(postgresIdentifierMaxBytes + 1)), true);
  });
});
