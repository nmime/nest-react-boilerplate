import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { MongoDBContainer, type StartedMongoDBContainer } from "@testcontainers/mongodb";
import { MongoClient } from "mongodb";
import { AuthMongoCollectionDefinitions } from "../../../../../libs/backend/mongodb/main/auth/lib/src/auth-mongo.collections.ts";
import { FeatureFlagCollectionName } from "../../../../../libs/backend/mongodb/main/feature-flags/lib/src/feature-flag-mongo.collection.ts";
import { NotificationMongoCollectionDefinitions } from "../../../../../libs/backend/mongodb/main/notification/lib/src/notification-mongo.collections.ts";
import {
  MongoMigrationLedgerCollection,
  runMongoMigrations,
  verifyMongoMigrations,
} from "../../../../../libs/backend/mongodb/main/shared/lib/src/migrations/mongo-migration.ts";
import { featureFlagMongoMigrations } from "../../../../../libs/backend/mongodb/main/feature-flags/lib/src/migrations/index.ts";
import { mongoMigrations } from "./mongo-migrate.ts";

const dockerAvailable =
  process.env.SKIP_INTEGRATION !== "1" &&
  spawnSync("docker", ["info"], { encoding: "utf8", timeout: 10_000 }).status === 0;

describe("complete MongoDB migration ledger", { skip: dockerAvailable ? false : "Docker is unavailable" }, () => {
  let container: StartedMongoDBContainer;
  let client: MongoClient;

  before(async () => {
    container = await new MongoDBContainer("mongo:7.0.26-jammy").start();
    const separator = container.getConnectionString().includes("?") ? "&" : "?";
    client = new MongoClient(`${container.getConnectionString()}${separator}directConnection=true&replicaSet=rs0`);
    await client.connect();
  }, { timeout: 180_000 });

  after(async () => {
    await client?.close();
    await container?.stop();
  }, { timeout: 30_000 });

  it("applies every provider on a fresh replica set and verifies replay", { timeout: 120_000 }, async () => {
    const database = client.db("migration_fresh_replay");

    assert.deepEqual(await runMongoMigrations(database, mongoMigrations), {
      applied: mongoMigrations.map((migration) => migration.id),
      skipped: [],
    });
    assert.deepEqual(await runMongoMigrations(database, mongoMigrations), {
      applied: [],
      skipped: mongoMigrations.map((migration) => migration.id),
    });
    await verifyMongoMigrations(database, mongoMigrations);

    const actualCollections = new Set(
      (await database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
    );
    const expectedCollections = [
      MongoMigrationLedgerCollection,
      "user",
      "session",
      "account",
      "verification",
      "fastify_sessions",
      ...AuthMongoCollectionDefinitions.map(({ name }) => name),
      FeatureFlagCollectionName,
      ...NotificationMongoCollectionDefinitions.map(({ name }) => name),
    ];
    assert.ok([...new Set(expectedCollections)].every((name) => actualCollections.has(name)));
  });

  it("keeps concurrent migrators idempotent with unique ledger records", { timeout: 120_000 }, async () => {
    const database = client.db("migration_concurrent");
    const results = await Promise.all([
      runMongoMigrations(database, mongoMigrations),
      runMongoMigrations(database, mongoMigrations),
    ]);

    assert.deepEqual(
      results.flatMap(({ applied }) => applied).sort(),
      mongoMigrations.map(({ id }) => id).sort(),
    );
    assert.equal(await database.collection(MongoMigrationLedgerCollection).countDocuments(), mongoMigrations.length);
    await verifyMongoMigrations(database, mongoMigrations);
  });

  it("rejects validator and index drift after recording migrations", { timeout: 120_000 }, async () => {
    const database = client.db("migration_drift");
    await runMongoMigrations(database, mongoMigrations);

    await database.command({
      collMod: FeatureFlagCollectionName,
      validator: { $jsonSchema: { bsonType: "array" } },
      validationAction: "error",
      validationLevel: "strict",
    });
    await assert.rejects(verifyMongoMigrations(database, mongoMigrations), /incompatible validator/u);

    await featureFlagMongoMigrations[0].up(database);
    const definition = NotificationMongoCollectionDefinitions.find(({ indexes }) => indexes.length > 0);
    assert.ok(definition);
    const indexName = definition.indexes[0]?.name;
    assert.equal(typeof indexName, "string");
    await database.collection(definition.name).dropIndex(indexName ?? "");
    await assert.rejects(verifyMongoMigrations(database, mongoMigrations), /is missing/u);
  });

  it("rejects missing seeded RBAC state after recording migrations", { timeout: 120_000 }, async () => {
    const database = client.db("migration_rbac_drift");
    await runMongoMigrations(database, mongoMigrations);
    const permissions = database.collection("auth_permissions");
    const permission = await permissions.findOne();
    assert.ok(permission);
    await permissions.deleteOne({ _id: permission._id });

    await assert.rejects(verifyMongoMigrations(database, mongoMigrations), /MongoDB RBAC permission/u);
  });
});
