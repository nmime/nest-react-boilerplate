// @requirements REQ-RUNTIME-DATABASE-008
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";
import { sharedMongoMigrations } from "../../../../../libs/backend/mongodb/main/shared/lib/src/migrations/index.ts";
import { authMongoMigrations } from "../../../../../libs/backend/mongodb/main/auth/lib/src/migrations/index.ts";
import { featureFlagMongoMigrations } from "../../../../../libs/backend/mongodb/main/feature-flags/lib/src/migrations/index.ts";
import { notificationMongoMigrations } from "../../../../../libs/backend/mongodb/main/notification/lib/src/migrations/index.ts";
import {
  createMongoMigrationClientOptions,
  createMongoMigrationEnvironment,
  mongoMigrations,
} from "./mongo-migrate.ts";

describe("MongoDB migration environment", () => {
  // The property worth pinning is that the ledger is *complete, unique, and ordered* — not which
  // migrations happen to exist today. A hardcoded list turned every new migration into a red test
  // whose only fix was appending a string, which is exactly the edit that also hides a dropped
  // provider.
  it("composes every current persistence provider in deterministic ledger order", () => {
    const ledger = mongoMigrations.map((migration) => migration.id);

    assert.deepEqual([...ledger].sort((left, right) => left.localeCompare(right)), ledger);
    assert.equal(new Set(ledger).size, ledger.length);

    for (const [provider, migrations] of Object.entries({
      shared: sharedMongoMigrations,
      auth: authMongoMigrations,
      "feature-flags": featureFlagMongoMigrations,
      notification: notificationMongoMigrations,
    })) {
      assert.ok(migrations.length > 0, `${provider} contributes no migrations`);
      for (const migration of migrations) {
        assert.ok(ledger.includes(migration.id), `${provider} migration ${migration.id} is missing from the ledger`);
      }
    }
  });

  // The bootstrap migrations already ran on live databases, so their ids may never be renamed or
  // reordered — later additions append, they never rewrite this prefix.
  it("keeps the shipped bootstrap prefix frozen", () => {
    assert.deepEqual(mongoMigrations.slice(0, 5).map((migration) => migration.id), [
      "20260726000000_create_better_auth_collections",
      "20260726000100_create_canonical_sessions",
      "20260726000200_initialize_auth_persistence",
      "20260726000300_initialize_feature_flags",
      "20260726000400_initialize_notifications",
    ]);
  });

  it("keeps the pruned migrator dependency closure MongoDB-capable", () => {
    const workspaceRoot = new URL("../../../../../", import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL("docker/migrator-package.json", workspaceRoot), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const workspace = JSON.parse(readFileSync(new URL("package.json", workspaceRoot), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const nestCommon = workspace.dependencies?.["@nestjs/common"];
    const nestCore = workspace.dependencies?.["@nestjs/core"];
    assert.equal(manifest.dependencies?.mongodb, "7.0.0");
    assert.equal(manifest.dependencies?.["mongodb-connection-string-url"], "7.0.2");
    assert.equal(typeof nestCommon, "string");
    assert.equal(nestCommon, nestCore);
    assert.equal(manifest.dependencies?.["@nestjs/common"], nestCommon);
    assert.equal(
      manifest.dependencies?.["@nestjs/core"],
      nestCore,
      "migrator must pin @nestjs/core with @nestjs/common so @mikro-orm/nestjs cannot resolve a mismatched core",
    );
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

  it("omits URI-only load balancing from MongoClient migration options", async () => {
    const config = createMongoMigrationEnvironment({
      MONGODB_URI: "mongodb://mongo/app?replicaSet=rs0&retryWrites=true",
      MONGODB_DATABASE: "app",
    });
    const options = createMongoMigrationClientOptions(config);

    assert.equal("loadBalanced" in options, false);
    const client = new MongoClient(config.uri, options);
    await client.close();
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
