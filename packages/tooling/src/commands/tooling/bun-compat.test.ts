import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { bunCompatibilityProbes, childHasExited, readPinnedBunVersion } from "./bun-compat.ts";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("Bun compatibility contract", () => {
  it("covers graph, frontend renderers, mobile, NestJS, unit tests, and e2e", () => {
    const contract = bunCompatibilityProbes.map((probe) => `${probe.name}: ${probe.nxArgs.join(" ")}`).join("\n");

    for (const expected of [
      "show projects",
      "admin-app:build",
      "site-app:build",
      "mobile-app:export",
      "auth-app-api:build",
      "backend-common-bootstrap",
      "backend-common-exception",
      "backend-common-health",
      "auth-app-api:e2e",
      "--coverage.enabled=false",
    ]) {
      assert.match(contract, new RegExp(expected));
    }
  });

  it("requires an exact pinned Bun version", () => {
    const root = mkdtempSync(join(tmpdir(), "nrb-bun-version-"));
    temporaryRoots.push(root);
    writeFileSync(join(root, ".bun-version"), "1.3.14\n");
    assert.equal(readPinnedBunVersion(root), "1.3.14");

    writeFileSync(join(root, ".bun-version"), "latest\n");
    assert.throws(() => readPinnedBunVersion(root), /exact semantic version/u);
  });

  it("recognizes both normal and signal-based child exits", () => {
    assert.equal(childHasExited({ exitCode: null, signalCode: null }), false);
    assert.equal(childHasExited({ exitCode: 0, signalCode: null }), true);
    assert.equal(childHasExited({ exitCode: null, signalCode: "SIGTERM" }), true);
  });
});
