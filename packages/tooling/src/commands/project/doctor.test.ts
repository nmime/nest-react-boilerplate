import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkBunVersion, checkJavaScriptRuntime, checkNodeVersion, checkPnpmVersion } from "./doctor.ts";

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
    assert.equal(checkPnpmVersion("11.11.0").status, "pass");
    assert.equal(checkPnpmVersion("11.12.0").status, "fail");
  });
});
