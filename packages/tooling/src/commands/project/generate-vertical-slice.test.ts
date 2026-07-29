import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NxGeneratorFn } from "./nx-generator-runner.js";
import { runGenerateVerticalSlice } from "./generate-vertical-slice.ts";

describe("legacy vertical-slice adapter", () => {
  it("delegates every scaffold option to the canonical feature generator", async () => {
    let invocation: Parameters<NxGeneratorFn>[0] | undefined;
    const runner: NxGeneratorFn = (args) => {
      invocation = args;
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    const status = await runGenerateVerticalSlice({
      workspaceRoot: "/workspace",
      argv: [
        "billing-events",
        "--api-app=auth-app-api",
        "--frontend-app=admin-app",
        "--database=postgres",
        "--dry-run",
      ],
      runner,
    });

    assert.equal(status, 0);
    assert.equal(invocation?.collectionGenerator, "@repo/tooling:feature");
    assert.deepEqual(invocation?.generatorArgs, [
      "--name=billing-events",
      "--dryRun=true",
      "--apiApp=auth-app-api",
      "--frontendApp=admin-app",
      "--database=postgres",
    ]);
  });

  it("preserves missing-name failure behavior without invoking Nx", async () => {
    let called = false;
    const runner: NxGeneratorFn = () => {
      called = true;
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    assert.equal(await runGenerateVerticalSlice({ workspaceRoot: "/workspace", argv: [], runner }), 1);
    assert.equal(called, false);
  });
});
