import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkNodeVersion, checkPnpmVersion } from "./doctor.ts";

describe("project doctor runtime policy", () => {
  it("accepts Node 24 and rejects releases outside the supported major", () => {
    assert.equal(checkNodeVersion("v24.0.0").status, "pass");
    assert.equal(checkNodeVersion("v24.18.0").status, "pass");
    assert.equal(checkNodeVersion("v25.0.0").status, "fail");
    assert.equal(checkNodeVersion("v23.11.0").status, "fail");
    assert.equal(checkNodeVersion("invalid").status, "fail");
  });

  it("accepts the exact pinned pnpm version", () => {
    assert.equal(checkPnpmVersion("11.11.0").status, "pass");
    assert.equal(checkPnpmVersion("11.12.0").status, "fail");
  });
});
