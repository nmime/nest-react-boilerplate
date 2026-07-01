// @ts-nocheck
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCompositeFactory,
  createFactory,
  createFactoryWithTraits,
  createGlobalFactory,
  defineSequence,
  globalSequence,
  resetFactory,
} from "./seed-factories.ts";

describe("seed-factories: sequence", () => {
  it("produces strictly incrementing integers starting from 1", () => {
    const s = defineSequence();
    assert.equal(s.current, 1);
    assert.equal(s.next(), 2);
    assert.equal(s.next(), 3);
    assert.equal(s.current, 3);
  });

  it("resets back to start value", () => {
    const s = defineSequence();
    s.next();
    s.next();
    s.next();
    assert.equal(s.current, 4);
    s.reset();
    assert.equal(s.current, 1);
    assert.equal(s.next(), 2);
  });

  it("supports custom start value", () => {
    const s = defineSequence(10);
    assert.equal(s.current, 10);
    assert.equal(s.next(), 11);
    assert.equal(s.next(), 12);
    s.reset();
    assert.equal(s.current, 10);
  });

  it("setTo resets to a specific value", () => {
    const s = defineSequence();
    s.next();
    s.next();
    s.setTo(5);
    assert.equal(s.current, 5);
    assert.equal(s.next(), 6);
  });
});

describe("seed-factories: createFactory", () => {
  it("builds a single record with deterministic values", () => {
    const factory = createFactory({
      name: "Static Name",
    });
    const record = factory.build();
    assert.equal(record.name, "Static Name");
  });

  it("builds with functions that use the factory context sequence", () => {
    const factory = createFactory({
      id: (ctx) => `item_${ctx.sequence.next()}`,
      name: "Static Name",
    });
    resetFactory(factory);
    const record = factory.build();
    assert.equal(record.id, "item_1");
    assert.equal(record.name, "Static Name");
  });

  it("builds with overrides that replace attribute functions", () => {
    const factory = createFactory({
      id: (ctx) => `item_${ctx.sequence.next()}`,
      name: "Static Name",
    });
    const record = factory.build({ id: "override-id", name: "Override Name" });
    assert.equal(record.id, "override-id");
    assert.equal(record.name, "Override Name");
  });

  it("buildList produces multiple records with incrementing sequences", () => {
    const factory = createFactory({
      id: (ctx) => `item_${ctx.sequence.next()}`,
      name: "Static Name",
    });
    resetFactory(factory);
    const items = factory.buildList(3);
    assert.equal(items.length, 3);
    assert.equal(items[0].id, "item_1");
    assert.equal(items[1].id, "item_2");
    assert.equal(items[2].id, "item_3");
  });

  it("buildList with perIndexOverrides", () => {
    const factory = createFactory({
      id: (ctx) => `item_${ctx.sequence.next()}`,
      tag: "default",
    });
    const items = factory.buildList(3, (i) => ({ tag: `tag_${i}` }));
    assert.equal(items[0].tag, "tag_0");
    assert.equal(items[1].tag, "tag_1");
    assert.equal(items[2].tag, "tag_2");
  });

  it("buildWith merges inline trait objects", () => {
    const factory = createFactory({
      id: (ctx) => `item_${ctx.sequence.next()}`,
      role: "user",
      status: "active",
    });
    resetFactory(factory);
    const record = factory.buildWith([{ role: "admin", status: "suspended" }]);
    assert.equal(record.id, "item_1");
    assert.equal(record.role, "admin");
    assert.equal(record.status, "suspended");
  });

  it("buildWith ignores unknown named trait strings safely", () => {
    const factory = createFactory({
      id: (ctx) => `item_${ctx.sequence.next()}`,
      name: "Default",
    });
    resetFactory(factory);
    const record = factory.buildWith(["nonexistent_trait"]);
    assert.equal(record.id, "item_1");
    assert.equal(record.name, "Default");
  });

  it("getSequence returns the internal sequence", () => {
    const factory = createFactory({
      id: (ctx) => `x_${ctx.sequence.next()}`,
    });
    const sequence = factory.getSequence();
    assert.ok(sequence);
    assert.equal(typeof sequence.next, "function");
    assert.equal(typeof sequence.reset, "function");
    assert.equal(typeof sequence.current, "number");
  });
});

describe("seed-factories: createFactoryWithTraits", () => {
  it("builds with named traits", () => {
    const factory = createFactoryWithTraits(
      {
        id: (ctx) => `item_${ctx.sequence.next()}`,
        role: "user",
        status: "active",
      },
      {
        admin: { role: "admin" },
        deactivated: { status: "deactivated" },
      },
    );

    resetFactory(factory);
    const admin = factory.buildWith(["admin"]);
    assert.equal(admin.role, "admin");
    assert.equal(admin.status, "active");
  });

  it("combines multiple named traits", () => {
    const factory = createFactoryWithTraits(
      {
        id: (ctx) => `item_${ctx.sequence.next()}`,
        role: "user",
        status: "active",
      },
      {
        admin: { role: "admin" },
        deactivated: { status: "deactivated" },
      },
    );

    resetFactory(factory);
    const record = factory.buildWith(["admin", "deactivated"]);
    assert.equal(record.role, "admin");
    assert.equal(record.status, "deactivated");
  });

  it("inline objects override named traits", () => {
    const factory = createFactoryWithTraits(
      {
        id: (ctx) => `item_${ctx.sequence.next()}`,
        role: "user",
      },
      {
        admin: { role: "admin" },
      },
    );

    resetFactory(factory);
    const record = factory.buildWith(["admin", { role: "super-admin" }]);
    assert.equal(record.role, "super-admin");
  });

  it("buildListWith applies traits to all items", () => {
    const factory = createFactoryWithTraits(
      {
        id: (ctx) => `item_${ctx.sequence.next()}`,
        role: "user",
      },
      {
        admin: { role: "admin" },
      },
    );

    resetFactory(factory);
    const items = factory.buildListWith(3, ["admin"]);
    assert.equal(items.length, 3);
    for (const item of items) {
      assert.equal(item.role, "admin");
    }
  });
});

describe("seed-factories: determinism", () => {
  it("produces identical output across consecutive builds after reset", () => {
    const factory = createFactory({
      id: (ctx) => `item_${ctx.sequence.next()}`,
      email: (ctx) => `item${ctx.sequence.next()}@example.com`,
    });

    resetFactory(factory);
    const first = factory.build();
    resetFactory(factory);
    const second = factory.build();

    assert.deepEqual(first, second);
    assert.equal(first.id, second.id);
    assert.equal(first.email, second.email);
  });

  it("buildList is deterministic after reset", () => {
    const factory = createFactory({
      id: (ctx) => `item_${ctx.sequence.next()}`,
    });

    resetFactory(factory);
    const list1 = factory.buildList(3);
    resetFactory(factory);
    const list2 = factory.buildList(3);

    assert.deepEqual(list1, list2);
  });

  it("no hidden randomness: same sequence always produces same values", () => {
    const s1 = defineSequence();
    const s2 = defineSequence();

    for (let i = 0; i < 100; i++) {
      assert.equal(s1.next(), s2.next(), `Mismatch at iteration ${i}`);
    }
  });

  it("no secrets or crypto imported", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), "seed-factories.ts");
    const source = readFileSync(sourcePath, "utf8");
    assert.doesNotMatch(source, /Math\.random/u);
    assert.doesNotMatch(source, /randomBytes/u);
    assert.doesNotMatch(source, /crypto/u);
    assert.doesNotMatch(source, /Date\.now/u);
    assert.doesNotMatch(source, /performance\.now/u);
  });
});

describe("seed-factories: createGlobalFactory", () => {
  it("uses the global sequence for attribute generation", () => {
    const factory = createGlobalFactory({
      id: (ctx) => `global_${globalSequence.next()}`,
      value: 42,
    });

    globalSequence.reset();
    const record = factory.build();
    assert.equal(record.value, 42);
    assert.ok(typeof record.id === "string");
  });
});

describe("seed-factories: createCompositeFactory", () => {
  it("combines inner and outer factory output", () => {
    const innerFactory = createFactory({
      city: (ctx) => `City_${ctx.sequence.next()}`,
    });

    const outerFactory = createCompositeFactory(
      {
        name: (ctx) => `User_${ctx.sequence.next()}`,
      },
      "address",
      innerFactory,
    );

    resetFactory(outerFactory);
    resetFactory(innerFactory);
    const record = outerFactory.build();
    assert.ok(record.name.startsWith("User_"));
    assert.ok(record.address);
    assert.ok(record.address.city.startsWith("City_"));
  });
});

describe("seed-factories: integration with existing seed-safety patterns", () => {
  it("can build auth_users-compatible records deterministically", () => {
    const factory = createFactory({
      id: (ctx) => `u_${ctx.sequence.next()}`,
      email: (ctx) => `user${ctx.sequence.next()}@example.com`,
      displayName: (ctx) => `Test User ${ctx.sequence.next()}`,
      passwordHash: "pbkdf2_sha256$120000$salt$hash",
      status: "active",
      roles: () => ["user"],
      permissions: () => ["profile:read"],
    });

    resetFactory(factory);
    const users = factory.buildList(5);

    assert.equal(users.length, 5);
    for (const user of users) {
      assert.ok(typeof user.id === "string");
      assert.ok(typeof user.email === "string");
      assert.ok(typeof user.displayName === "string");
      assert.equal(Array.isArray(user.roles), true);
      assert.equal(Array.isArray(user.permissions), true);
    }
  });

  it("trait can override roles for admin users", () => {
    const factory = createFactoryWithTraits(
      {
        id: (ctx) => `u_${ctx.sequence.next()}`,
        email: (ctx) => `user${ctx.sequence.next()}@example.com`,
        displayName: "Test User",
        passwordHash: "pbkdf2_sha256$120000$salt$hash",
        status: "active",
        roles: () => ["user"],
        permissions: () => ["profile:read"],
      },
      {
        admin: {
          roles: ["user", "admin"],
          permissions: ["profile:read", "admin:dashboard:read"],
        },
      },
    );

    resetFactory(factory);
    const admin = factory.buildWith(["admin"]);
    assert.deepEqual(admin.roles, ["user", "admin"]);
    assert.deepEqual(admin.permissions, ["profile:read", "admin:dashboard:read"]);
  });

  it("deterministic auth_users output is reproducible", () => {
    const factory = createFactory({
      id: (ctx) => `u_${ctx.sequence.next()}`,
      email: (ctx) => `user${ctx.sequence.next()}@example.com`,
      roles: () => ["user"],
    });

    resetFactory(factory);
    const run1 = factory.buildList(3);
    resetFactory(factory);
    const run2 = factory.buildList(3);

    assert.deepEqual(run1, run2);
    assert.equal(run1[0].id, "u_1");
    assert.equal(run1[0].email, "user2@example.com");
    assert.equal(run1[1].id, "u_3");
    assert.equal(run1[1].email, "user4@example.com");
  });
});
