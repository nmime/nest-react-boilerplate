import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertRestoreSafety } from "./restore-safety.ts";

const localDatabase = "postgres://postgres:postgres@localhost:5432/nest_react_boilerplate";
const productionDatabase = "postgres://postgres:postgres@db.example.com:5432/app";

function restoreArgs(overrides = {}) {
  return { force: false, input: "backups/app.dump", yes: true, ...overrides };
}

describe("db restore safety guard", () => {
  it("delegates to assertLocalDevelopmentDatabase without --force", () => {
    let seen;
    assertRestoreSafety(restoreArgs(), productionDatabase, {
      assertLocalDevelopmentDatabase: (connectionString: string) => {
        seen = connectionString;
      },
    });
    assert.equal(seen, productionDatabase);
  });

  it("allows --force against a local development database", () => {
    assert.doesNotThrow(() =>
      assertRestoreSafety(restoreArgs({ force: true }), localDatabase, { env: {} }),
    );
  });

  it("rejects forced non-local production restore unless both explicit guards are enabled", () => {
    const args = restoreArgs({ force: true });

    assert.throws(
      () => assertRestoreSafety(args, productionDatabase, { env: { NODE_ENV: "production" } }),
      /DB_RESTORE_ALLOW_NON_LOCAL=true/,
    );

    assert.throws(
      () =>
        assertRestoreSafety(args, productionDatabase, {
          env: { DB_RESTORE_ALLOW_NON_LOCAL: "true", NODE_ENV: "production" },
        }),
      /DB_RESTORE_ALLOW_PRODUCTION=true/,
    );

    assert.doesNotThrow(() =>
      assertRestoreSafety(args, productionDatabase, {
        env: {
          DB_RESTORE_ALLOW_NON_LOCAL: "true",
          DB_RESTORE_ALLOW_PRODUCTION: "true",
          NODE_ENV: "production",
        },
      }),
    );
  });
});
