import assert from "node:assert/strict";
import { describe as nodeDescribe, it as nodeIt } from "node:test";
import { parseAddArgs, runAddCommand } from "./add.js";
import type { CommandContext } from "../../cli.js";
import { createNxGeneratorRunner } from "./nx-generator-runner.js";
import type { NxGeneratorFn, NxGeneratorResult } from "./nx-generator-runner.js";

// node:test and vitest expose compatible describe/it (name, fn) call shapes.
type TestRunner = (name: string, fn: () => void | Promise<void>) => void;
const { describe, it } = (process.env.VITEST
  ? await import("vitest")
  : { describe: nodeDescribe, it: nodeIt }) as unknown as {
  describe: TestRunner;
  it: TestRunner;
};

// ---------------------------------------------------------------------------
// parseAddArgs unit tests
// ---------------------------------------------------------------------------

describe("parseAddArgs", () => {
  it("parses kind and name", () => {
    const args = parseAddArgs(["app", "my-app"]);
    assert.equal(args.kind, "app");
    assert.equal(args.name, "my-app");
  });

  it("parses lib kind", () => {
    const args = parseAddArgs(["lib", "shared-utils"]);
    assert.equal(args.kind, "lib");
    assert.equal(args.name, "shared-utils");
  });

  it("parses feature kind with --api-app", () => {
    const args = parseAddArgs(["feature", "invoices", "--api-app", "auth-app-api"]);
    assert.equal(args.kind, "feature");
    assert.equal(args.name, "invoices");
    assert.equal(args.apiApp, "auth-app-api");
  });

  it("parses --api-app= shorthand", () => {
    const args = parseAddArgs(["feature", "billing", "--api-app=user-app-api"]);
    assert.equal(args.apiApp, "user-app-api");
  });

  it("parses --dry-run and --force", () => {
    const args = parseAddArgs(["feature", "x", "--dry-run", "--force"]);
    assert.equal(args.dryRun, true);
    assert.equal(args.force, true);
  });

  it("parses --help", () => {
    const args = parseAddArgs(["--help"]);
    assert.equal(args.help, true);
  });

  it("captures extra args after --", () => {
    const args = parseAddArgs(["app", "my-app", "--", "--extra-flag"]);
    assert.deepEqual(args.extra, ["--extra-flag"]);
  });

  it("default apiApp is user-app-api", () => {
    const args = parseAddArgs(["feature", "x"]);
    assert.equal(args.apiApp, "user-app-api");
  });
});

// ---------------------------------------------------------------------------
// runAddCommand tests with mocked runner
// ---------------------------------------------------------------------------

function makeMockRunner(result: NxGeneratorResult): NxGeneratorFn {
  return () => result;
}

function makeContext(argv: string[]): CommandContext {
  return { argv, packageRoot: "/tmp", workspaceRoot: "/tmp" };
}

describe("runAddCommand", () => {
  it("dispatches app to @repo/tooling:application", async () => {
    let capturedCg: string | undefined;
    const runner: NxGeneratorFn = (args) => {
      capturedCg = args.collectionGenerator;
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    const status = await runAddCommand(makeContext(["app", "payments"]), runner);
    assert.equal(status, 0);
    assert.equal(capturedCg, "@repo/tooling:application");
  });

  it("dispatches lib to @repo/tooling:library", async () => {
    let capturedCg: string | undefined;
    const runner: NxGeneratorFn = (args) => {
      capturedCg = args.collectionGenerator;
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    const status = await runAddCommand(makeContext(["lib", "shared-utils"]), runner);
    assert.equal(status, 0);
    assert.equal(capturedCg, "@repo/tooling:library");
  });

  it("dispatches feature to @repo/tooling:feature", async () => {
    let capturedCg: string | undefined;
    const runner: NxGeneratorFn = (args) => {
      capturedCg = args.collectionGenerator;
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    const status = await runAddCommand(makeContext(["feature", "billing"]), runner);
    assert.equal(status, 0);
    assert.equal(capturedCg, "@repo/tooling:feature");
  });

  it("passes --dry-run as --dryRun=true to Nx", async () => {
    let capturedArgs: string[] | undefined;
    const runner: NxGeneratorFn = (args) => {
      capturedArgs = args.generatorArgs;
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    await runAddCommand(makeContext(["feature", "billing", "--dry-run"]), runner);
    assert.ok(capturedArgs?.includes("--dryRun=true"));
  });

  it("passes --force as --force=true to Nx", async () => {
    let capturedArgs: string[] | undefined;
    const runner: NxGeneratorFn = (args) => {
      capturedArgs = args.generatorArgs;
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    await runAddCommand(makeContext(["feature", "billing", "--force"]), runner);
    assert.ok(capturedArgs?.includes("--force=true"));
  });

  it("passes --api-app to Nx", async () => {
    let capturedArgs: string[] | undefined;
    const runner: NxGeneratorFn = (args) => {
      capturedArgs = args.generatorArgs;
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    await runAddCommand(makeContext(["feature", "billing", "--api-app", "auth-app-api"]), runner);
    assert.ok(capturedArgs?.includes("--apiApp=auth-app-api"));
  });

  it("forwards extra args to Nx", async () => {
    let capturedArgs: string[] | undefined;
    const runner: NxGeneratorFn = (args) => {
      capturedArgs = args.generatorArgs;
      return { success: true, stdout: "", stderr: "", exitCode: 0 };
    };

    await runAddCommand(makeContext(["app", "my-app", "--", "--skip-format"]), runner);
    assert.ok(capturedArgs?.includes("--skip-format"));
  });

  it("returns non-zero on generator failure", async () => {
    const runner = makeMockRunner({
      success: false,
      stdout: "",
      stderr: "Error: something went wrong",
      exitCode: 1,
    });

    const status = await runAddCommand(makeContext(["app", "x"]), runner);
    assert.equal(status, 1);
  });

  it("returns 1 when kind is missing", async () => {
    const runner = makeMockRunner({ success: true, stdout: "", stderr: "", exitCode: 0 });
    const status = await runAddCommand(makeContext(["my-app"]), runner);
    assert.equal(status, 1);
  });

  it("returns 1 when name is missing", async () => {
    const runner = makeMockRunner({ success: true, stdout: "", stderr: "", exitCode: 0 });
    const status = await runAddCommand(makeContext(["app"]), runner);
    assert.equal(status, 1);
  });
});

// ---------------------------------------------------------------------------
// nx-generator-runner tests
// ---------------------------------------------------------------------------

describe("createNxGeneratorRunner", () => {
  it("returns mock when provided", () => {
    const mock: NxGeneratorFn = () => ({ success: true, stdout: "mock", stderr: "", exitCode: 0 });
    const runner = createNxGeneratorRunner(mock);
    const result = runner({ collectionGenerator: "test", generatorArgs: [], cwd: "/tmp" });
    assert.equal(result.stdout, "mock");
  });
});
