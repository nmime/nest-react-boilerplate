// @requirements REQ-RUNTIME-DATABASE-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createMongoMigrationEnvironment, mongoMigrations } from "./mongo-migrate.ts";

describe("MongoDB migration environment", () => {
  it("composes every current persistence provider in deterministic ledger order", () => {
    assert.deepEqual(
      mongoMigrations.map((migration) => migration.id),
      [
        "20260726000000_create_better_auth_collections",
        "20260726000100_create_canonical_sessions",
        "20260726000200_initialize_auth_persistence",
        "20260726000300_initialize_feature_flags",
        "20260726000400_initialize_notifications",
      ],
    );
  });

  it("keeps the pruned migrator dependency closure MongoDB-capable", () => {
    const manifestUrl = new URL("../../../../../docker/migrator-package.json", import.meta.url);
    const manifest = JSON.parse(readFileSync(fileURLToPath(manifestUrl), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    assert.equal(manifest.dependencies?.mongodb, "7.0.0");
    assert.equal(manifest.dependencies?.["mongodb-connection-string-url"], "7.0.2");
    assert.equal(manifest.dependencies?.["@nestjs/common"], "11.1.28");
  });

  it("validates and resolves matching URI, database, and replica-set settings", () => {
    const uri = "mongodb://user:pass@mongo-a.example:27017,mongo-b.example:27018/app?replicaSet=rs0&retryWrites=true";
    assert.deepEqual(
      createMongoMigrationEnvironment({
        MONGODB_URI: uri,
        MONGODB_DATABASE: "app",
        MONGODB_REPLICA_SET: "rs0",
      }),
      {
        uri,
        database: "app",
        replicaSet: "rs0",
      },
    );
  });

  it("requires an explicit URI and database", () => {
    assert.throws(() => createMongoMigrationEnvironment({ MONGODB_DATABASE: "app" }), /MONGODB_URI/u);
    assert.throws(
      () => createMongoMigrationEnvironment({ MONGODB_URI: "mongodb://mongo/app?replicaSet=rs0" }),
      /MONGODB_DATABASE/u,
    );
  });

  it("rejects invalid, mismatched, and unsafe MongoDB configuration without exposing credentials", () => {
    assert.throws(
      () =>
        createMongoMigrationEnvironment({
          MONGODB_URI: "https://user:secret@example.test/app",
          MONGODB_DATABASE: "app",
        }),
      /valid mongodb/u,
    );
    assert.throws(
      () =>
        createMongoMigrationEnvironment({
          MONGODB_URI: "mongodb://mongo/other?replicaSet=rs0",
          MONGODB_DATABASE: "app",
        }),
      /must match/u,
    );
    assert.throws(
      () =>
        createMongoMigrationEnvironment({
          MONGODB_URI: "mongodb://mongo/app?replicaSet=rs0&directConnection=true",
          MONGODB_DATABASE: "app",
        }),
      /directConnection/u,
    );
    assert.throws(
      () =>
        createMongoMigrationEnvironment({
          MONGODB_URI: "mongodb://mongo/app?replicaSet=rs0&retryWrites=sometimes",
          MONGODB_DATABASE: "app",
        }),
      /must be true or false/u,
    );
    assert.throws(
      () =>
        createMongoMigrationEnvironment({
          MONGODB_URI: "mongodb://mongo/app?replicaSet=rs0&w=1",
          MONGODB_DATABASE: "app",
        }),
      /majority/u,
    );
    assert.throws(
      () =>
        createMongoMigrationEnvironment({
          MONGODB_URI: "mongodb://user:secret@mongo/app?replicaSet=rs0",
          MONGODB_DATABASE: "bad.name",
        }),
      (error: unknown) => error instanceof Error && !error.message.includes("secret") && /MONGODB_DATABASE/u.test(error.message),
    );
  });

  it("rejects conflicting or empty replica-set requirements", () => {
    assert.throws(
      () =>
        createMongoMigrationEnvironment({
          MONGODB_URI: "mongodb://mongo/app?replicaSet=rs0",
          MONGODB_DATABASE: "app",
          MONGODB_REPLICA_SET: "rs1",
        }),
      /must match/u,
    );
    assert.throws(
      () =>
        createMongoMigrationEnvironment({
          MONGODB_URI: "mongodb://mongo/app?replicaSet=",
          MONGODB_DATABASE: "app",
        }),
      /must not be empty/u,
    );
    assert.throws(
      () =>
        createMongoMigrationEnvironment({
          MONGODB_URI: "mongodb://mongo/app",
          MONGODB_DATABASE: "app",
          MONGODB_REPLICA_SET: "replica set",
        }),
      /must not contain whitespace/u,
    );
  });
});
