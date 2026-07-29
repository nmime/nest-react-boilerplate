import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ClientSession, Db, Document } from "mongodb";
import { seedMongoBootstrap } from "./mongo-seed.ts";
import { buildSeedUsers, permissions, rolePermissions } from "./seed-data.ts";

class FakeCollection {
  readonly documents: Document[] = [];
  readonly updates: Array<{ options: Document; update: Document }> = [];

  async updateOne(filter: Document, update: Document, options: Document) {
    this.updates.push({ options, update });
    const existing = this.documents.find((document) => matches(document, filter));
    if (existing) return { upsertedCount: 0 };
    this.documents.push({ ...(update.$setOnInsert as Document) });
    return { upsertedCount: 1 };
  }

  async findOne(filter: Document) {
    return this.documents.find((document) => matches(document, filter)) ?? null;
  }
}

class FakeDatabase {
  readonly collections = new Map<string, FakeCollection>();

  collection(name: string): FakeCollection {
    let collection = this.collections.get(name);
    if (!collection) {
      collection = new FakeCollection();
      this.collections.set(name, collection);
    }
    return collection;
  }
}

describe("MongoDB bootstrap seed", () => {
  it("creates the canonical bootstrap records idempotently through upserts", async () => {
    const database = new FakeDatabase();
    const session = {} as ClientSession;
    const users = buildSeedUsers("local-test-password");

    const first = await seedMongoBootstrap(
      database as unknown as Pick<Db, "collection">,
      users,
      session,
    );
    const second = await seedMongoBootstrap(
      database as unknown as Pick<Db, "collection">,
      users,
      session,
    );

    assert.deepEqual(first, {
      permissions: permissions.length,
      roles: 2,
      rolePermissions: Object.values(rolePermissions).flat().length,
      users: 3,
      userRoles: 3,
    });
    assert.deepEqual(second, {
      permissions: 0,
      roles: 0,
      rolePermissions: 0,
      users: 0,
      userRoles: 0,
    });
    assert.equal(database.collection("auth_users").documents.length, 3);
    assert.equal(database.collection("auth_roles").documents.length, 2);
    assert.equal(database.collection("auth_permissions").documents.length, permissions.length);
    for (const collection of database.collections.values()) {
      for (const { options, update } of collection.updates) {
        assert.equal(options.upsert, true);
        assert.equal(options.session, session);
        assert.ok(update.$setOnInsert);
        assert.equal(update.$set, undefined);
      }
    }
  });
});

function matches(document: Document, filter: Document): boolean {
  return Object.entries(filter).every(([key, value]) => document[key] === value);
}
