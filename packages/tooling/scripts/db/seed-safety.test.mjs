import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSeedSafety,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
  resolvePassword,
} from "./seed-safety.mjs";

const localDatabase = "postgres://postgres:postgres@localhost:5432/nest_react_boilerplate";
const productionDatabase = "postgres://postgres:postgres@db.example.com:5432/app";

function defaultArgs(overrides = {}) {
  return {
    email: DEFAULT_ADMIN_EMAIL,
    force: false,
    password: DEFAULT_ADMIN_PASSWORD,
    passwordEnv: "",
    ...overrides,
  };
}

describe("db seed safety guard", () => {
  it("rejects default seed credentials in production before any database connection", () => {
    assert.throws(
      () =>
        assertSeedSafety(defaultArgs(), localDatabase, {
          assertLocalDevelopmentDatabase: () => undefined,
          env: { NODE_ENV: "production" },
        }),
      /Default seed admin credentials are not allowed/,
    );
  });

  it("rejects forced non-local production seeding unless both explicit guards are enabled", () => {
    const args = defaultArgs({
      email: "ops-admin@example.com",
      force: true,
      password: "CorrectHorseBatteryStaple123!",
    });

    assert.throws(
      () =>
        assertSeedSafety(args, productionDatabase, {
          env: { NODE_ENV: "production" },
        }),
      /DB_SEED_ALLOW_NON_LOCAL=true/,
    );

    assert.throws(
      () =>
        assertSeedSafety(args, productionDatabase, {
          env: {
            DB_SEED_ALLOW_NON_LOCAL: "true",
            NODE_ENV: "production",
          },
        }),
      /DB_SEED_ALLOW_PRODUCTION=true/,
    );

    assert.doesNotThrow(() =>
      assertSeedSafety(args, productionDatabase, {
        env: {
          DB_SEED_ALLOW_NON_LOCAL: "true",
          DB_SEED_ALLOW_PRODUCTION: "true",
          NODE_ENV: "production",
        },
      }),
    );
  });

  it("resolves password-env without requiring a database", () => {
    assert.equal(
      resolvePassword(
        defaultArgs({ password: "ignored", passwordEnv: "ADMIN_SEED_PASSWORD" }),
        { ADMIN_SEED_PASSWORD: "FromEnvironment123!" },
      ),
      "FromEnvironment123!",
    );
    assert.throws(
      () =>
        resolvePassword(
          defaultArgs({ passwordEnv: "ADMIN_SEED_PASSWORD" }),
          {},
        ),
      /ADMIN_SEED_PASSWORD must contain the seed password/,
    );
  });
});
