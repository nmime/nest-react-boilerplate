// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertLocalDevelopmentDatabase } from "./env-loader.ts";

// Both the default local-dev setup and the default prod deployment use host
// "postgres" and db "nest_react_boilerplate", so the host/name heuristic alone
// cannot tell them apart. NODE_ENV is the primary, fail-closed discriminator.
const defaultDatabase = "postgres://postgres:postgres@postgres:5432/nest_react_boilerplate";

describe("assertLocalDevelopmentDatabase production guard", () => {
  it("throws for the default db name when NODE_ENV=production", () => {
    assert.throws(
      () => assertLocalDevelopmentDatabase(defaultDatabase, { NODE_ENV: "production" }),
      /NODE_ENV=production/,
    );
  });

  it("allows the default db name for local dev (NODE_ENV unset)", () => {
    assert.doesNotThrow(() => assertLocalDevelopmentDatabase(defaultDatabase, {}));
  });

  it("allows the default db name for NODE_ENV=development", () => {
    assert.doesNotThrow(() =>
      assertLocalDevelopmentDatabase(defaultDatabase, { NODE_ENV: "development" }),
    );
  });

  it("allows production only with the explicit DB_ALLOW_DESTRUCTIVE opt-in", () => {
    assert.doesNotThrow(() =>
      assertLocalDevelopmentDatabase(defaultDatabase, {
        DB_ALLOW_DESTRUCTIVE: "true",
        NODE_ENV: "production",
      }),
    );
  });

  it("still rejects genuinely non-local databases outside production", () => {
    assert.throws(
      () =>
        assertLocalDevelopmentDatabase("postgres://postgres:postgres@db.example.com:5432/app", {}),
      /non-local\/dev database/,
    );
  });
});
