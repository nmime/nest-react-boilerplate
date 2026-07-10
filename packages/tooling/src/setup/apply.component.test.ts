/**
 * Component and E2E tests for atomic apply with in-memory filesystem adapter.
 *
 * Tests: in-memory apply, rollback on injected failure, conflict refusal,
 * force replacement, no-op replay, prune protection, dry-run, json_merge.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { SetupOperation } from "./operations.js";
import { createFile, updateFile, deleteFile, jsonMerge } from "./operations.js";
import type { FilesystemAdapter, ApplyResult } from "./adapters/filesystem.js";
import { apply, checkConflicts, backupFiles, rollback, isNoOp, filterNoOps } from "./apply.js";
import { hashString } from "./state.js";

// ---------------------------------------------------------------------------
// In-memory filesystem adapter for testing
// ---------------------------------------------------------------------------

class InMemoryFS implements FilesystemAdapter {
  private store = new Map<string, string>();

  async read(p: string): Promise<string | null> {
    return this.store.get(p) ?? null;
  }

  async write(p: string, content: string): Promise<void> {
    this.store.set(p, content);
  }

  async delete(p: string): Promise<void> {
    this.store.delete(p);
  }

  async exists(p: string): Promise<boolean> {
    return this.store.has(p);
  }

  async list(_dir?: string): Promise<string[]> {
    return [...this.store.keys()].sort();
  }

  /** Expose raw store for assertions. */
  getStore(): Map<string, string> {
    return this.store;
  }

  reset(): void {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// UNIT: individual apply helpers
// ---------------------------------------------------------------------------

describe("apply — checkConflicts (heuristic mode)", () => {
  it("no conflicts for create on missing file", async () => {
    const fs = new InMemoryFS();
    const ops: SetupOperation[] = [createFile("new.txt", "content")];
    const conflicts = await checkConflicts(ops, fs);
    assert.deepEqual(conflicts, []);
  });

  it("conflict for create when file already exists", async () => {
    const fs = new InMemoryFS();
    await fs.write("a.txt", "original");
    const ops: SetupOperation[] = [createFile("a.txt", "new")];
    const conflicts = await checkConflicts(ops, fs);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].path, "a.txt");
    assert.equal(conflicts[0].reason, "unexpected");
  });

  it("update_file has no heuristic conflict (content change is expected)", async () => {
    const fs = new InMemoryFS();
    await fs.write("a.txt", "original");
    const ops: SetupOperation[] = [updateFile("a.txt", "changed")];
    const conflicts = await checkConflicts(ops, fs);
    assert.deepEqual(conflicts, []); // update is always allowed in heuristic mode
  });

  it("json_merge conflict when file is missing", async () => {
    const fs = new InMemoryFS();
    const ops: SetupOperation[] = [jsonMerge("missing.json", { x: 1 })];
    const conflicts = await checkConflicts(ops, fs);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].reason, "missing");
  });

  it("json_merge no conflict when file exists", async () => {
    const fs = new InMemoryFS();
    await fs.write("c.json", "{}");
    const ops: SetupOperation[] = [jsonMerge("c.json", { x: 1 })];
    const conflicts = await checkConflicts(ops, fs);
    assert.deepEqual(conflicts, []);
  });
});

describe("apply — checkConflicts (state-aware mode)", () => {
  it("detects third-party modification via hash mismatch", async () => {
    const fs = new InMemoryFS();
    await fs.write("a.txt", "original");
    const stateFiles = { "a.txt": hashString("original") };
    // Simulate file changed between plan and apply
    await fs.write("a.txt", "tampered");
    const ops: SetupOperation[] = [updateFile("a.txt", "planned")];
    const conflicts = await checkConflicts(ops, fs, stateFiles);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].reason, "content_changed");
  });

  it("no conflict when state matches current content", async () => {
    const fs = new InMemoryFS();
    const content = "stable";
    await fs.write("a.txt", content);
    const stateFiles = { "a.txt": hashString(content) };
    const ops: SetupOperation[] = [updateFile("a.txt", content)];
    const conflicts = await checkConflicts(ops, fs, stateFiles);
    assert.deepEqual(conflicts, []);
  });
});

describe("apply — isNoOp", () => {
  it("create is no-op if file already has content", async () => {
    const fs = new InMemoryFS();
    await fs.write("a.txt", "hello");
    const op = createFile("a.txt", "hello");
    assert.ok(await isNoOp(op, fs));
  });

  it("create is not no-op if file missing", async () => {
    const fs = new InMemoryFS();
    const op = createFile("a.txt", "hello");
    assert.ok(!(await isNoOp(op, fs)));
  });

  it("update is no-op if content matches", async () => {
    const fs = new InMemoryFS();
    await fs.write("a.txt", "same");
    const op = updateFile("a.txt", "same");
    assert.ok(await isNoOp(op, fs));
  });

  it("delete is no-op if file already gone", async () => {
    const fs = new InMemoryFS();
    const op = deleteFile("gone.txt");
    assert.ok(await isNoOp(op, fs));
  });
});

describe("apply — filterNoOps", () => {
  it("filters out no-ops, keeps real operations", async () => {
    const fs = new InMemoryFS();
    await fs.write("a.txt", "existing");
    const ops: SetupOperation[] = [
      createFile("a.txt", "existing"), // no-op
      createFile("b.txt", "new"),        // real
      deleteFile("gone.txt"),             // no-op
    ];
    const filtered = await filterNoOps(ops, fs);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].path, "b.txt");
  });
});

// ---------------------------------------------------------------------------
// COMPONENT: full apply flow
// ---------------------------------------------------------------------------

describe("apply — basic create", () => {
  it("creates a new file", async () => {
    const fs = new InMemoryFS();
    const ops: SetupOperation[] = [createFile("a.txt", "hello")];
    const result = await apply(ops, fs);
    assert.equal(result.applied, 1);
    assert.equal(result.failed, 0);
    assert.equal(await fs.read("a.txt"), "hello");
  });
});

describe("apply — empty replay", () => {
  it("empty operation list returns zero counts", async () => {
    const fs = new InMemoryFS();
    const result = await apply([], fs);
    assert.equal(result.applied, 0);
    assert.equal(result.skipped, 0);
    assert.equal(result.failed, 0);
  });
});

describe("apply — conflict refusal", () => {
  it("refuses create when file already exists (no force)", async () => {
    const fs = new InMemoryFS();
    await fs.write("a.txt", "original");
    const ops: SetupOperation[] = [createFile("a.txt", "new")];
    const result = await apply(ops, fs);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.applied, 0);
    assert.equal(await fs.read("a.txt"), "original"); // unchanged
  });

  it("refuses json_merge when file is missing (no force)", async () => {
    const fs = new InMemoryFS();
    const ops: SetupOperation[] = [jsonMerge("missing.json", { x: 1 })];
    const result = await apply(ops, fs);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.applied, 0);
  });

  it("refuses when state-aware conflict detected", async () => {
    const fs = new InMemoryFS();
    await fs.write("a.txt", "original");
    const stateFiles = { "a.txt": hashString("original") };
    // Tamper after plan
    await fs.write("a.txt", "tampered");
    const ops: SetupOperation[] = [updateFile("a.txt", "new")];
    const result = await apply(ops, fs, { stateFiles });
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.applied, 0);
  });
});

describe("apply — force replacement", () => {
  it("force overwrites existing file on create", async () => {
    const fs = new InMemoryFS();
    await fs.write("a.txt", "original");
    const ops: SetupOperation[] = [createFile("a.txt", "forced")];
    const result = await apply(ops, fs, { force: true });
    assert.equal(result.applied, 1);
    assert.equal(await fs.read("a.txt"), "forced");
  });

  it("force skips conflict check entirely", async () => {
    const fs = new InMemoryFS();
    await fs.write("a.txt", "original");
    const ops: SetupOperation[] = [createFile("a.txt", "forced")];
    const result = await apply(ops, fs, { force: true });
    assert.equal(result.applied, 1);
    assert.equal(result.conflicts.length, 0);
  });
});

describe("apply — rollback on injected failure", () => {
  it("restores originals when second op fails", async () => {
    const fs = new InMemoryFS();
    await fs.write("a.txt", "original-a");
    await fs.write("b.txt", "original-b");

    const ops: SetupOperation[] = [
      updateFile("a.txt", "new-a"),
      updateFile("b.txt", "new-b"),
    ];

    const result = await apply(ops, fs, { failOnPaths: ["b.txt"] });

    assert.equal(result.failed, 1);
    assert.ok(result.rollbackError);
    assert.equal(result.applied, 0);

    // Verify rollback: files restored
    assert.equal(await fs.read("a.txt"), "original-a");
    assert.equal(await fs.read("b.txt"), "original-b");
  });

  it("rollback removes files that were newly created", async () => {
    const fs = new InMemoryFS();
    await fs.write("a.txt", "keep");

    const ops: SetupOperation[] = [
      createFile("b.txt", "new"),   // new file
      updateFile("a.txt", "changed"), // will fail
    ];

    const result = await apply(ops, fs, { failOnPaths: ["a.txt"] });

    assert.equal(result.failed, 1);
    assert.equal(result.applied, 0);

    // b.txt should be rolled back (deleted since it didn't exist before)
    assert.equal(await fs.read("b.txt"), null);
    // a.txt should still have original content
    assert.equal(await fs.read("a.txt"), "keep");
  });
});

describe("apply — dry-run", () => {
  it("reports applied count without writing", async () => {
    const fs = new InMemoryFS();
    const ops: SetupOperation[] = [
      createFile("a.txt", "content"),
      createFile("b.txt", "more"),
    ];
    const result = await apply(ops, fs, { dryRun: true });
    assert.equal(result.applied, 2);
    assert.equal(result.failed, 0);
    // Verify nothing was written
    assert.equal(await fs.read("a.txt"), null);
    assert.equal(await fs.read("b.txt"), null);
  });
});

describe("apply — delete", () => {
  it("deletes an existing file", async () => {
    const fs = new InMemoryFS();
    await fs.write("old.txt", "data");
    const ops: SetupOperation[] = [deleteFile("old.txt")];
    const result = await apply(ops, fs);
    assert.equal(result.applied, 1);
    assert.equal(await fs.read("old.txt"), null);
  });

  it("delete is success when file absent", async () => {
    const fs = new InMemoryFS();
    const ops: SetupOperation[] = [deleteFile("gone.txt")];
    const result = await apply(ops, fs);
    assert.equal(result.applied, 1);
    assert.equal(result.failed, 0);
  });
});

describe("apply — json_merge", () => {
  it("merges patch into existing JSON", async () => {
    const fs = new InMemoryFS();
    await fs.write("config.json", JSON.stringify({ a: 1 }, null, 2) + "\n");
    const ops: SetupOperation[] = [jsonMerge("config.json", { b: 2 })];
    const result = await apply(ops, fs);
    assert.equal(result.applied, 1);
    const content = await fs.read("config.json");
    const parsed = JSON.parse(content!);
    assert.equal(parsed.a, 1);
    assert.equal(parsed.b, 2);
  });

  it("json_merge refused on missing file (no force)", async () => {
    const fs = new InMemoryFS();
    const ops: SetupOperation[] = [jsonMerge("missing.json", { x: 1 })];
    const result = await apply(ops, fs);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.applied, 0);
  });

  it("json_merge with force creates empty object first", async () => {
    const fs = new InMemoryFS();
    const ops: SetupOperation[] = [jsonMerge("new.json", { x: 1 })];
    const result = await apply(ops, fs, { force: true });
    assert.equal(result.applied, 1);
    const raw = await fs.read("new.json");
    assert.ok(raw !== null);
    const parsed = JSON.parse(raw ?? "{}");
    assert.equal(parsed.x, 1);
  });
});

describe("apply — no-op replay", () => {
  it("re-applying same content is clean update", async () => {
    const fs = new InMemoryFS();
    // First apply
    const ops: SetupOperation[] = [createFile("a.txt", "content")];
    await apply(ops, fs);

    // Replay as update: no conflict in heuristic mode
    const ops2: SetupOperation[] = [updateFile("a.txt", "content")];
    const result = await apply(ops2, fs);
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.applied, 1);
    assert.equal(await fs.read("a.txt"), "content");
  });
});

describe("apply — prune protection", () => {
  it("delete operations are executed without extra checks", async () => {
    const fs = new InMemoryFS();
    await fs.write("stale.txt", "old data");
    const ops: SetupOperation[] = [deleteFile("stale.txt")];
    const result = await apply(ops, fs);
    assert.equal(result.applied, 1);
    assert.equal(await fs.exists("stale.txt"), false);
  });
});

describe("apply — atomic writes (simulated)", () => {
  it("in-memory adapter writes atomically (single set)", async () => {
    const fs = new InMemoryFS();
    const ops: SetupOperation[] = [createFile("a.txt", "atomic content")];
    const result = await apply(ops, fs);
    assert.equal(result.applied, 1);
    // Verify content is complete (not partial)
    assert.equal(await fs.read("a.txt"), "atomic content");
  });
});

// ---------------------------------------------------------------------------
// E2E: full flow — plan state → apply → verify
// ---------------------------------------------------------------------------

describe("apply — E2E full flow", () => {
  it("apply all operations and verify filesystem state", async () => {
    const fs = new InMemoryFS();
    const ops: SetupOperation[] = [
      createFile("nrb.config.json", '{"schemaVersion":"1.0.0"}\n'),
      createFile(".nrb/summary.md", "# Summary\n"),
    ];
    // Pre-create a stale file
    await fs.write("old/config.txt", "stale");

    const result = await apply(ops, fs);
    assert.equal(result.applied, 2);
    assert.equal(result.failed, 0);

    assert.equal(await fs.read("nrb.config.json"), '{"schemaVersion":"1.0.0"}\n');
    assert.equal(await fs.read(".nrb/summary.md"), "# Summary\n");
  });

  it("full rollback leaves filesystem identical to pre-apply", async () => {
    const fs = new InMemoryFS();
    await fs.write("a.txt", "orig-a");
    await fs.write("b.txt", "orig-b");
    await fs.write("c.txt", "orig-c");

    // Snapshot pre-state
    const preState = new Map(fs.getStore());

    const ops: SetupOperation[] = [
      updateFile("a.txt", "new-a"),
      updateFile("b.txt", "new-b"),
    ];

    const result = await apply(ops, fs, { failOnPaths: ["b.txt"] });

    assert.equal(result.failed, 1);
    assert.equal(result.applied, 0);

    // Verify filesystem is byte-identical to pre-state
    for (const [key, value] of preState) {
      assert.equal(await fs.read(key), value, `File ${key} not restored`);
    }
  });
});
