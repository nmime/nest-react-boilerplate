import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildState, hashString } from "../../setup/state.ts";
import {
  checkBunVersion,
  checkJavaScriptRuntime,
  checkNodeVersion,
  checkNrbState,
  checkPnpmVersion,
} from "./doctor.ts";

describe("project doctor runtime policy", () => {
  it("accepts Node 24 and rejects releases outside the supported major", () => {
    assert.equal(checkNodeVersion("v24.0.0").status, "pass");
    assert.equal(checkNodeVersion("v24.18.0").status, "pass");
    assert.equal(checkNodeVersion("v25.0.0").status, "fail");
    assert.equal(checkNodeVersion("v23.11.0").status, "fail");
    assert.equal(checkNodeVersion("invalid").status, "fail");
  });

  it("identifies the pinned Bun runtime instead of its Node compatibility version", () => {
    assert.deepEqual(checkJavaScriptRuntime({ name: "bun", version: "1.3.14", nodeCompatibilityVersion: "24.3.0" }), {
      name: "runtime-version",
      status: "pass",
      message: "Bun 1.3.14",
    });
    assert.equal(checkBunVersion("1.3.13").status, "fail");
  });

  it("accepts the exact pinned pnpm version", () => {
    assert.equal(checkPnpmVersion("11.15.1").status, "pass");
    assert.equal(checkPnpmVersion("11.12.0").status, "fail");
  });

  it("rejects malformed state and detects generated-file drift", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "nrb-doctor-state-"));
    const stateDirectory = join(workspaceRoot, ".nrb");
    mkdirSync(stateDirectory);

    try {
      writeFileSync(join(stateDirectory, "state.json"), JSON.stringify({ version: 1, files: {} }));
      assert.equal(checkNrbState(workspaceRoot).status, "warn");

      const trackedPath = ".nrb/workspace.json";
      writeFileSync(join(workspaceRoot, trackedPath), "expected\n");
      const state = buildState(hashString("config"), { [trackedPath]: hashString("expected\n") });
      writeFileSync(join(stateDirectory, "state.json"), JSON.stringify(state));
      assert.equal(checkNrbState(workspaceRoot).status, "pass");

      writeFileSync(join(workspaceRoot, trackedPath), "manually changed\n");
      const drifted = checkNrbState(workspaceRoot);
      assert.equal(drifted.status, "fail");
      assert.match(drifted.message, /workspace\.json/u);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
