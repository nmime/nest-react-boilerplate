// @requirements REQ-SCAFFOLD-SAFETY-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertSeedSafety,
  DefaultAdminEmail,
  DefaultAdminPassword,
  isLocalDevelopmentDatabase,
  resolvePassword,
} from "./seed-safety.ts";
import { isLocalMongoDatabase } from "./mongo-client.ts";

const localDatabase = "postgres://postgres:postgres@localhost:5432/nest_react_boilerplate";
const productionDatabase = "postgres://postgres:postgres@db.example.com:5432/app";
// The default prod deployment shares this host+db name with local dev.
const defaultDatabase = "postgres://postgres:postgres@postgres:5432/nest_react_boilerplate";
const defaultMongoDatabase = "mongodb://mongo:nest@mongo:27017/nest_react_boilerplate?replicaSet=rs0";
const setupMongoDatabase = "mongodb://mongodb.localhost:27017/nest_react_boilerplate?replicaSet=rs0";

function defaultArgs(overrides = {}) {
  return {
    email: DefaultAdminEmail,
    force: false,
    password: DefaultAdminPassword,
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

  it("does not treat the default db name as local-dev under NODE_ENV=production", () => {
    assert.equal(
      isLocalDevelopmentDatabase(defaultDatabase, { NODE_ENV: "production" }),
      false,
    );
  });

  it("still treats the default db name as local-dev for local development", () => {
    assert.equal(isLocalDevelopmentDatabase(defaultDatabase, {}), true);
    assert.equal(
      isLocalDevelopmentDatabase(defaultDatabase, { NODE_ENV: "development" }),
      true,
    );
    assert.equal(isLocalMongoDatabase(defaultMongoDatabase, {}), true);
    assert.equal(isLocalMongoDatabase(setupMongoDatabase, {}), true);
    assert.equal(
      isLocalDevelopmentDatabase("postgres://postgres:postgres@mongo:5432/nest_react_boilerplate", {}),
      false,
    );
  });

  it("blocks forced seeding of the default db in production via the existing gates", () => {
    const args = defaultArgs({
      email: "ops-admin@example.com",
      force: true,
      password: "CorrectHorseBatteryStaple123!",
    });

    assert.throws(
      () => assertSeedSafety(args, defaultDatabase, { env: { NODE_ENV: "production" } }),
      /DB_SEED_ALLOW_NON_LOCAL=true/,
    );

    assert.doesNotThrow(() =>
      assertSeedSafety(args, defaultDatabase, {
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
