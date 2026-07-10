/**
 * Tests for the deterministic operation planner and state management.
 *
 * UNIT: isolated function tests
 * COMPONENT: multi-unit integration (planner + state + operations)
 * E2E: full flow from config → plan → state → idempotent replay
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseNrbConfig, SCHEMA_VERSION } from "./schema.js";
import { createFile, deleteFile, sortOperations, compareOperations, operationsEqual, operationArraysEqual } from "./operations.js";
import {
  configHash,
  hashString,
  buildState,
  diffState,
  computeStateDigest,
  addFileToState,
  removeFileFromState,
  migrateState,
  EMPTY_STATE,
  computeConfigDigest,
} from "./state.js";
import {
  plan,
  resolveConfig,
  generateConfigFile,
  generateSummaryMd,
} from "./planner.js";

/* ==================================================================
 * UNIT: operations.ts
 * ================================================================== */

describe("operations — factories", () => {
  it("createFile sets kind and path", () => {
    const op = createFile("a/b.txt", "hello");
    assert.equal(op.kind, "create_file");
    assert.equal(op.path, "a/b.txt");
    assert.equal(op.content, "hello");
    assert.equal(op.description, "Create a/b.txt");
  });

  it("deleteFile sets kind and path", () => {
    const op = deleteFile("old.txt");
    assert.equal(op.kind, "delete_file");
    assert.equal(op.path, "old.txt");
  });

  it("custom description overrides default", () => {
    const op = createFile("x.txt", "v", "Custom desc");
    assert.equal(op.description, "Custom desc");
  });
});

describe("operations — compareOperations", () => {
  it("sorts deletes before creates", () => {
    const ops = [
      createFile("a.txt", "x"),
      deleteFile("b.txt"),
    ];
    const sorted = sortOperations(ops);
    assert.equal(sorted[0].kind, "delete_file");
    assert.equal(sorted[1].kind, "create_file");
  });

  it("sorts by path within same kind", () => {
    const ops = [
      createFile("z.txt", "x"),
      createFile("a.txt", "x"),
    ];
    const sorted = sortOperations(ops);
    assert.equal(sorted[0].path, "a.txt");
    assert.equal(sorted[1].path, "z.txt");
  });

  it("compareOperations is deterministic", () => {
    const ops = [
      createFile("b.txt", "x"),
      deleteFile("a.txt"),
      createFile("a.txt", "x"),
      deleteFile("b.txt"),
    ];
    const s1 = sortOperations(ops);
    const s2 = sortOperations(ops);
    assert.ok(operationArraysEqual(s1, s2));
  });
});

describe("operations — equality", () => {
  it("identical operations are equal", () => {
    const a = createFile("x.txt", "content");
    const b = createFile("x.txt", "content");
    assert.ok(operationsEqual(a, b));
  });

  it("different content means not equal", () => {
    const a = createFile("x.txt", "aaa");
    const b = createFile("x.txt", "bbb");
    assert.ok(!operationsEqual(a, b));
  });

  it("different paths means not equal", () => {
    const a = createFile("a.txt", "x");
    const b = createFile("b.txt", "x");
    assert.ok(!operationsEqual(a, b));
  });

  it("different kinds means not equal", () => {
    const a = createFile("x.txt", "x");
    const b = deleteFile("x.txt");
    assert.ok(!operationsEqual(a, b));
  });
});

/* ==================================================================
 * UNIT: state.ts — hashing
 * ================================================================== */

describe("state — hashString", () => {
  it("same input produces same hash", () => {
    const h1 = hashString("hello");
    const h2 = hashString("hello");
    assert.equal(h1, h2);
  });

  it("different input produces different hash", () => {
    assert.notEqual(hashString("hello"), hashString("world"));
  });

  it("hash is a 64-char hex string (SHA-256)", () => {
    const h = hashString("test");
    assert.equal(h.length, 64);
    assert.match(h, /^[0-9a-f]+$/);
  });
});

describe("state — configHash is deterministic", () => {
  it("same config produces same hash regardless of key order", () => {
    const a = configHash({ b: 2, a: 1 });
    const b = configHash({ a: 1, b: 2 });
    assert.equal(a, b);
  });

  it("different config produces different hash", () => {
    const a = configHash({ a: 1 });
    const b = configHash({ a: 2 });
    assert.notEqual(a, b);
  });
});

describe("state — computeConfigDigest is alias", () => {
  it("matches configHash output", () => {
    const cfg = { apps: ["a"], caps: ["b"] };
    assert.equal(computeConfigDigest(cfg), configHash(cfg));
  });
});

/* ==================================================================
 * UNIT: state.ts — state operations
 * ================================================================== */

describe("state — buildState", () => {
  it("builds state with correct digest", () => {
    const s = buildState("abc", { "f.txt": "h1" });
    assert.equal(s.version, 1);
    assert.equal(s.configHash, "abc");
    assert.equal(s.files["f.txt"], "h1");
    assert.equal(s.digest, computeStateDigest({ "f.txt": "h1" }));
  });
});

describe("state — computeStateDigest is order-independent", () => {
  it("same files different insertion order produce same digest", () => {
    const d1 = computeStateDigest({ b: "1", a: "2" });
    const d2 = computeStateDigest({ a: "2", b: "1" });
    assert.equal(d1, d2);
  });

  it("empty files produce deterministic digest", () => {
    const d = computeStateDigest({});
    assert.equal(d, hashString("{}"));
  });
});

describe("state — addFileToState", () => {
  it("adds a new file entry", () => {
    const s = buildState("h", {});
    const s2 = addFileToState(s, "x.txt", "hash1");
    assert.equal(s2.files["x.txt"], "hash1");
    assert.ok(!s.files["x.txt"]); // original unchanged
  });

  it("overwrites existing file entry", () => {
    const s = buildState("h", { "x.txt": "old" });
    const s2 = addFileToState(s, "x.txt", "new");
    assert.equal(s2.files["x.txt"], "new");
    assert.equal(s.files["x.txt"], "old");
  });
});

describe("state — removeFileFromState", () => {
  it("removes a file entry", () => {
    const s = buildState("h", { "x.txt": "h1", "y.txt": "h2" });
    const s2 = removeFileFromState(s, "x.txt");
    assert.ok(!("x.txt" in s2.files));
    assert.equal(s2.files["y.txt"], "h2");
  });

  it("no-op on missing key", () => {
    const s = buildState("h", { "x.txt": "h1" });
    const s2 = removeFileFromState(s, "z.txt");
    assert.deepEqual(s2.files, { "x.txt": "h1" });
  });
});

/* ==================================================================
 * UNIT: state.ts — diffState
 * ================================================================== */

describe("state — diffState", () => {
  it("empty current + non-empty desired = all creates", () => {
    const current = buildState("h", {});
    const desired = { "a.txt": "h1", "b.txt": "h2" };
    const d = diffState(current, desired);
    assert.deepEqual(d.toCreate, ["a.txt", "b.txt"]);
    assert.deepEqual(d.toUpdate, []);
    assert.deepEqual(d.toPrune, []);
  });

  it("identical current and desired = all unchanged", () => {
    const current = buildState("h", { "a.txt": "h1" });
    const desired = { "a.txt": "h1" };
    const d = diffState(current, desired);
    assert.deepEqual(d.toCreate, []);
    assert.deepEqual(d.toUpdate, []);
    assert.deepEqual(d.unchanged, ["a.txt"]);
  });

  it("changed hash = update", () => {
    const current = buildState("h", { "a.txt": "old" });
    const desired = { "a.txt": "new" };
    const d = diffState(current, desired);
    assert.deepEqual(d.toUpdate, ["a.txt"]);
  });

  it("extra file in current = prune", () => {
    const current = buildState("h", { "a.txt": "h1", "old.txt": "h2" });
    const desired = { "a.txt": "h1" };
    const d = diffState(current, desired);
    assert.deepEqual(d.toPrune, ["old.txt"]);
  });
});

/* ==================================================================
 * UNIT: state.ts — migrateState
 * ================================================================== */

describe("state — migrateState", () => {
  it("returns empty state for null", () => {
    assert.deepEqual(migrateState(null), EMPTY_STATE);
  });

  it("returns empty state for non-object", () => {
    assert.deepEqual(migrateState("string"), EMPTY_STATE);
    assert.deepEqual(migrateState(42), EMPTY_STATE);
  });

  it("returns empty state for missing version", () => {
    assert.deepEqual(migrateState({ files: {} }), EMPTY_STATE);
  });

  it("returns empty state for version < 1", () => {
    assert.deepEqual(migrateState({ version: 0, files: {} }), EMPTY_STATE);
  });

  it("passes through v1 state", () => {
    const v1 = { version: 1, configHash: "abc", files: { "x.txt": "h1" }, digest: "d1" };
    const result = migrateState(v1);
    assert.deepEqual(result, v1);
  });

  it("returns empty for future version (safety)", () => {
    const future = { version: 99, configHash: "x", files: {}, digest: "d" };
    const result = migrateState(future);
    assert.deepEqual(result, EMPTY_STATE);
  });
});

/* ==================================================================
 * UNIT: planner.ts — resolveConfig
 * ================================================================== */

describe("planner — resolveConfig", () => {
  it("resolves minimal preset with expanded deps", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION, preset: "minimal" });
    const resolved = resolveConfig(config);
    assert.ok(resolved.apps.includes("auth-app-api"));
    assert.ok(resolved.apps.includes("user-app-api"));
    assert.ok(resolved.capabilities.includes("postgres"));
  });

  it("explicit apps override but preserve preset deps", () => {
    const config = parseNrbConfig({
      schemaVersion: SCHEMA_VERSION,
      preset: "minimal",
      apps: ["admin-app"],
    });
    const resolved = resolveConfig(config);
    assert.ok(resolved.apps.includes("admin-app"));
    assert.ok(resolved.apps.includes("auth-app-api"));
  });

  it("empty config resolves to empty lists", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION });
    const resolved = resolveConfig(config);
    assert.deepEqual(resolved.apps, []);
    assert.deepEqual(resolved.capabilities, []);
  });
});

/* ==================================================================
 * UNIT: planner.ts — generateConfigFile
 * ================================================================== */

describe("planner — generateConfigFile", () => {
  it("generates nrb.config.json path", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION });
    const result = generateConfigFile(config);
    assert.equal(result.path, "nrb.config.json");
    assert.ok(result.content.endsWith("\n"));
    const parsed = JSON.parse(result.content);
    assert.equal(parsed.schemaVersion, "1.0.0");
  });

  it("content is deterministic", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION, preset: "starter" });
    const c1 = generateConfigFile(config);
    const c2 = generateConfigFile(config);
    assert.equal(c1.content, c2.content);
  });
});

/* ==================================================================
 * UNIT: planner.ts — generateSummaryMd
 * ================================================================== */

describe("planner — generateSummaryMd", () => {
  it("generates .nrb/summary.md path", () => {
    const summary = {
      apps: ["admin-app"],
      capabilities: ["postgres"],
      preset: "starter",
      configHash: "abc123",
    };
    const result = generateSummaryMd(summary);
    assert.equal(result.path, ".nrb/summary.md");
    assert.ok(result.content.includes("# Setup Plan Summary"));
    assert.ok(result.content.includes("`starter`"));
    assert.ok(result.content.includes("- admin-app"));
  });

  it("no preset omits preset line", () => {
    const summary = {
      apps: [], capabilities: [], preset: undefined,
      configHash: "x",
    };
    const result = generateSummaryMd(summary);
    assert.ok(!result.content.includes("Preset:"));
    assert.ok(result.content.includes("*No applications selected.*"));
  });

  it("content is deterministic (no timestamps or op counts)", () => {
    const summary = {
      apps: ["a"], capabilities: ["b"], preset: "minimal",
      configHash: "fixed",
    };
    const c1 = generateSummaryMd(summary);
    const c2 = generateSummaryMd(summary);
    assert.equal(c1.content, c2.content);
  });
});

/* ==================================================================
 * COMPONENT: planner + state — plan()
 * ================================================================== */

describe("planner — plan() basic", () => {
  it("produces operations for fresh state", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION, preset: "minimal" });
    const result = plan(config, EMPTY_STATE);
    assert.ok(result.operations.length > 0);
    assert.equal(result.configHash.length, 64); // SHA-256 hex
    assert.equal(result.expectedState.configHash, result.configHash);
  });

  it("generated plan includes nrb.config.json", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION });
    const result = plan(config, EMPTY_STATE);
    const configOp = result.operations.find(o => o.path === "nrb.config.json");
    assert.ok(configOp, "Expected nrb.config.json in operations");
  });

  it("generated plan includes .nrb/summary.md", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION });
    const result = plan(config, EMPTY_STATE);
    const summaryOp = result.operations.find(o => o.path === ".nrb/summary.md");
    assert.ok(summaryOp, "Expected .nrb/summary.md in operations");
  });
});

describe("planner — stable ordering", () => {
  it("plan operations are sorted by compareOperations", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION, preset: "minimal" });
    const result = plan(config, EMPTY_STATE);
    for (let i = 1; i < result.operations.length; i++) {
      assert.ok(
        compareOperations(result.operations[i - 1], result.operations[i]) <= 0,
        `Operations not sorted at index ${i}`
      );
    }
  });
});

describe("planner — idempotency (empty replay)", () => {
  it("second plan with matching state returns empty operations", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION, preset: "minimal" });
    const first = plan(config, EMPTY_STATE);
    // Simulate applying: use expected state from first plan
    const second = plan(config, first.expectedState);
    assert.equal(second.operations.length, 0, "Second plan should be empty (idempotent)");
  });

  it("third plan is also empty", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION });
    const first = plan(config, EMPTY_STATE);
    const second = plan(config, first.expectedState);
    const third = plan(config, second.expectedState);
    assert.equal(third.operations.length, 0);
  });
});

describe("planner — generated hash matches", () => {
  it("configHash in summary matches plan configHash", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION, preset: "bots" });
    const result = plan(config, EMPTY_STATE);
    assert.equal(result.summary.configHash, result.configHash);
  });
});

describe("planner — prune protection", () => {
  it("without prune option, prunableFiles is empty", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION });
    const state = buildState("old", { "nrb.config.json": "h1", ".nrb/summary.md": "h2", "old-file.txt": "h3" });
    const result = plan(config, state);
    assert.deepEqual(result.prunableFiles, []);
    assert.equal(result.operations.filter(o => o.kind === "delete_file").length, 0);
  });

  it("with prune option, stale files are listed as prunable", () => {
    const config = parseNrbConfig({
      schemaVersion: SCHEMA_VERSION,
      options: { prune: true, force: false, dryRun: false, nonInteractive: false },
    });
    const state = buildState("old", {
      "nrb.config.json": "h1",
      ".nrb/summary.md": "h2",
      "stale.txt": "h3",
    });
    const result = plan(config, state);
    assert.ok(result.prunableFiles.includes("stale.txt"), "stale.txt should be prunable");
  });
});

describe("planner — conflict detection via diff", () => {
  it("content change detected as update not create", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION, preset: "minimal" });
    const first = plan(config, EMPTY_STATE);
    // Simulate the config file was changed on disk (hash mismatch)
    const tamperedState = buildState(
      first.configHash,
      { ...first.expectedState.files, "nrb.config.json": "tampered-hash" },
    );
    const result = plan(config, tamperedState);
    const configOp = result.operations.find(o => o.path === "nrb.config.json");
    assert.ok(configOp, "Config file should need updating");
    assert.equal(configOp.kind, "update_file", "Should be update, not create");
  });
});

/* ==================================================================
 * E2E: full plan flow
 * ================================================================== */

describe("planner — E2E full flow", () => {
  it("enterprise preset: plan → state → empty replay", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION, preset: "enterprise" });
    const first = plan(config, EMPTY_STATE);
    assert.ok(first.operations.length > 0, "First plan should have operations");
    assert.ok(first.summary.apps.length > 0, "Should have apps");
    assert.ok(first.summary.capabilities.length > 0, "Should have capabilities");

    const second = plan(config, first.expectedState);
    assert.equal(second.operations.length, 0, "Second plan should be empty");
  });

  it("config hash is stable across plans", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION, apps: ["user-app-api"], capabilities: ["postgres"] });
    const h1 = plan(config, EMPTY_STATE).configHash;
    const h2 = plan(config, EMPTY_STATE).configHash;
    assert.equal(h1, h2);
  });

  it("snapshots contain no timestamps or machine paths", () => {
    const config = parseNrbConfig({ schemaVersion: SCHEMA_VERSION, preset: "starter" });
    const result = plan(config, EMPTY_STATE);
    for (const op of result.operations) {
      assert.ok(!op.path.startsWith("/"), `Path should be relative: ${op.path}`);
      if ("content" in op) {
        const content = (op as any).content as string;
        assert.ok(!content.includes(new Date().toISOString()), "No ISO timestamps in content");
      }
    }
  });
});
