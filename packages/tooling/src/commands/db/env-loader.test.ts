import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertLocalMongoDatabase, redactMongoConnectionString } from "./mongo-client.ts";
import {
  assertLocalPostgresDatabase,
  postgresConnectionString,
  redactedPostgresConnectionString,
} from "./postgres-environment.ts";

// Both the default local-dev setup and the default prod deployment use host
// "postgres" and db "nest_react_boilerplate", so the host/name heuristic alone
// cannot tell them apart. NODE_ENV is the primary, fail-closed discriminator.
const defaultDatabase = "postgres://postgres:postgres@postgres:5432/nest_react_boilerplate";

describe("assertLocalDevelopmentDatabase production guard", () => {
  it("builds an encoded Postgres URL from split environment variables", () => {
    assert.equal(
      postgresConnectionString({
        POSTGRES_DB: "test_db",
        POSTGRES_HOST: "db",
        POSTGRES_PASSWORD: "test password",
        POSTGRES_PORT: "5433",
        POSTGRES_USER: "test user",
      }),
      "postgres://test%20user:test%20password@db:5433/test_db",
    );
  });

  it("throws for the default db name when NODE_ENV=production", () => {
    assert.throws(
      () => assertLocalPostgresDatabase(defaultDatabase, { NODE_ENV: "production" }),
      /NODE_ENV=production/,
    );
  });

  it("allows the default db name for local dev (NODE_ENV unset)", () => {
    assert.doesNotThrow(() => assertLocalPostgresDatabase(defaultDatabase, {}));
  });

  it("allows the default db name for NODE_ENV=development", () => {
    assert.doesNotThrow(() =>
      assertLocalPostgresDatabase(defaultDatabase, { NODE_ENV: "development" }),
    );
  });

  it("allows production only with the explicit DB_ALLOW_DESTRUCTIVE opt-in", () => {
    assert.doesNotThrow(() =>
      assertLocalPostgresDatabase(defaultDatabase, {
        DB_ALLOW_DESTRUCTIVE: "true",
        NODE_ENV: "production",
      }),
    );
  });

  it("still rejects genuinely non-local databases outside production", () => {
    assert.throws(
      () =>
        assertLocalPostgresDatabase("postgres://postgres:postgres@db.example.com:5432/app", {}),
      /non-local\/dev database/,
    );
  });

  it("supports MongoDB seed lists while failing closed for non-local hosts", () => {
    const local = "mongodb://user:secret@mongo:27017,mongodb.localhost:27018/nest_react_boilerplate?replicaSet=rs0";
    assert.doesNotThrow(() => assertLocalMongoDatabase(local, {}));
    assert.doesNotMatch(redactMongoConnectionString(local), /secret/u);
    assert.throws(
      () =>
        assertLocalMongoDatabase(
          "mongodb://user:secret@mongo-a:27017,mongo-b:27018/nest_react_boilerplate?replicaSet=rs0",
          {},
        ),
      /non-local\/dev database/u,
    );
  });
});
