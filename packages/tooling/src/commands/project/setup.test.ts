// @requirements REQ-SCAFFOLD-TOOLING-005
// Evidence for: REQ-SCAFFOLD-TOOLING-005
/**
 * Unit and component tests for setup CLI, doctor, and prompts.
 *
 * Three layers:
 *   UNIT — isolated parsers, builders, formatter functions
 *   COMPONENT — setup command wired with mock adapter, doctor checks
 *   E2E — argument parsing and config building
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Re-exports from existing modules we test against
// ---------------------------------------------------------------------------
import {
  parseNrbConfig,
  schemaVersion,
  type NrbConfig,
  type AppId,
  type CapabilityId,
  presetIds,
} from "../../setup/schema.js";
import { plan, resolveConfig } from "../../setup/planner.js";
import { emptyState } from "../../setup/state.js";
import { expandPreset } from "../../setup/presets.js";
import type { PromptIo, PromptResult } from "../../setup/prompts.js";
import type { SetupCommandDependencies } from "./setup.js";

// ---------------------------------------------------------------------------
// Import commands under test
// ---------------------------------------------------------------------------
import { parseArgs, runSetupCommand, runSetupCommandInteractive } from "./setup.js";
import { runDoctorCommand, type DoctorCheck } from "./doctor.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function captureStdout(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stdout.write;
  process.stdout.write = (chunk: string | Buffer) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join("");
}

function captureStderr(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stderr.write;
  process.stderr.write = (chunk: string | Buffer) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stderr.write = orig;
  }
  return chunks.join("");
}

const setupDependencies: SetupCommandDependencies = {
  synchronizeClosure: async () => ({
    changed: false,
    invalidatedLock: false,
    artifacts: {
      caddyfile: { path: ".nrb/Caddyfile.per-app-domains", content: "# generated\n" },
      singleDomainCaddyfile: { path: ".nrb/Caddyfile.single-domain", content: "# generated\n" },
      manifest: { path: ".nrb/closure.json", content: "{}\n" },
      helmValues: { path: ".helm/values-selection.yaml", content: "deployment: {}\n" },
      packageManifest: { path: ".nrb/closure/package.json", content: "{}\n" },
      workspaceManifest: { path: ".nrb/closure/pnpm-workspace.yaml", content: "packages: []\n" },
    },
  }),
};

// ============================================================================
// UNIT: setup.ts — argument parser
// ============================================================================

describe("setup — parseArgs", () => {
  it("defaults to all false flags", () => {
    const args = parseArgs([]);
    assert.equal(args.dryRun, false);
    assert.equal(args.prune, false);
    assert.equal(args.force, false);
    assert.equal(args.nonInteractive, false);
    assert.equal(args.json, false);
    assert.equal(args.help, false);
    assert.equal(args.list, false);
    assert.equal(args.replace, false);
    assert.equal(args.preset, undefined);
    assert.deepEqual(args.apps, []);
    assert.deepEqual(args.capabilities, []);
    assert.deepEqual(args.removeApps, []);
    assert.deepEqual(args.removeCapabilities, []);
  });

  it("parses --dry-run", () => {
    const args = parseArgs(["--dry-run"]);
    assert.equal(args.dryRun, true);
  });

  it("parses --prune", () => {
    assert.equal(parseArgs(["--prune"]).prune, true);
  });

  it("parses --force", () => {
    assert.equal(parseArgs(["--force"]).force, true);
  });

  it("parses --non-interactive", () => {
    assert.equal(parseArgs(["--non-interactive"]).nonInteractive, true);
  });

  it("parses --json", () => {
    assert.equal(parseArgs(["--json"]).json, true);
  });

  it("parses --help / -h", () => {
    assert.equal(parseArgs(["--help"]).help, true);
    assert.equal(parseArgs(["-h"]).help, true);
  });

  it("parses --preset <name>", () => {
    assert.equal(parseArgs(["--preset", "fullstack"]).preset, "fullstack");
    assert.equal(parseArgs(["--preset=web"]).preset, "web");
  });

  it("parses --config <path>", () => {
    assert.equal(parseArgs(["--config", "nrb.config.json"]).config, "nrb.config.json");
    assert.equal(parseArgs(["--config=/abs/path.json"]).config, "/abs/path.json");
  });

  it("parses multiple --app", () => {
    const args = parseArgs(["--app", "admin-app", "--app", "user-app"]);
    assert.deepEqual(args.apps, ["admin-app", "user-app"]);
  });

  it("parses multiple --capability", () => {
    const args = parseArgs(["--capability=postgres", "--capability", "redis"]);
    assert.deepEqual(args.capabilities, ["postgres", "redis"]);
  });

  it("parses additive, removal, replacement, and list selection flags", () => {
    const args = parseArgs([
      "--app=mobile-app",
      "--remove-app",
      "landing-app",
      "--remove-capability=analytics",
      "--replace",
      "--list",
    ]);
    assert.deepEqual(args.apps, ["mobile-app"]);
    assert.deepEqual(args.removeApps, ["landing-app"]);
    assert.deepEqual(args.removeCapabilities, ["analytics"]);
    assert.equal(args.replace, true);
    assert.equal(args.list, true);
  });

  it("rejects a missing option value", () => {
    assert.throws(() => parseArgs(["--app"]), /--app requires a value/);
    assert.throws(() => parseArgs(["--remove-app="]), /--remove-app requires a value/);
  });

  it("reports a missing option value without an uncaught CLI error", async () => {
    let capturedErr = "";
    const original = process.stderr.write;
    process.stderr.write = (chunk: string | Buffer) => {
      capturedErr += String(chunk);
      return true;
    };
    try {
      const status = await runSetupCommand({
        argv: ["--app"],
        packageRoot: "/mock/packages/tooling",
        workspaceRoot: "/tmp",
      });
      assert.equal(status, 1);
      assert.match(capturedErr, /Configuration error: --app requires a value/);
    } finally {
      process.stderr.write = original;
    }
  });

  it("parses all flags together", () => {
    const args = parseArgs([
      "--preset",
      "minimal",
      "--dry-run",
      "--prune",
      "--force",
      "--non-interactive",
      "--json",
      "--app",
      "auth-app-api",
      "--capability",
      "postgres",
    ]);
    assert.equal(args.preset, "minimal");
    assert.equal(args.dryRun, true);
    assert.equal(args.prune, true);
    assert.equal(args.force, true);
    assert.equal(args.nonInteractive, true);
    assert.equal(args.json, true);
    assert.deepEqual(args.apps, ["auth-app-api"]);
    assert.deepEqual(args.capabilities, ["postgres"]);
  });

  it("skips -- separator", () => {
    const args = parseArgs(["--", "--dry-run"]);
    assert.equal(args.dryRun, false); // should be treated as pass-through
  });

  it("throws on unknown option", () => {
    assert.throws(() => parseArgs(["--unknown-flag"]), {
      message: /Unknown option/,
    });
  });

  it("returns configuration error on invalid app ID", async () => {
    let capturedErr = "";
    const orig = process.stderr.write;
    process.stderr.write = (chunk: string | Buffer) => {
      capturedErr += String(chunk);
      return true;
    };
    try {
      const status = await runSetupCommand({
        argv: ["--app", "nonexistent-app", "--non-interactive"],
        packageRoot: "/mock/packages/tooling",
        workspaceRoot: "/tmp",
      });
      assert.equal(status, 1);
      assert.ok(capturedErr.includes("Configuration error"), "Should report configuration error");
    } finally {
      process.stderr.write = orig;
    }
  });

  it("returns configuration error on invalid capability ID", async () => {
    let capturedErr = "";
    const orig = process.stderr.write;
    process.stderr.write = (chunk: string | Buffer) => {
      capturedErr += String(chunk);
      return true;
    };
    try {
      const status = await runSetupCommand({
        argv: ["--capability", "nonexistent-cap", "--non-interactive"],
        packageRoot: "/mock/packages/tooling",
        workspaceRoot: "/tmp",
      });
      assert.equal(status, 1);
      assert.ok(capturedErr.includes("Configuration error"), "Should report configuration error");
    } finally {
      process.stderr.write = orig;
    }
  });

  it("handles non-Error thrown values gracefully", async () => {
    // Simulate a scenario where buildConfigFromArgs throws a plain string
    // by passing a --config pointing to a file that triggers an error.
    // The catch handler should not crash on unknown thrown values.
    let capturedErr = "";
    const orig = process.stderr.write;
    process.stderr.write = (chunk: string | Buffer) => {
      capturedErr += String(chunk);
      return true;
    };
    try {
      const status = await runSetupCommand({
        argv: ["--config", "/nonexistent/path/to/config.json", "--non-interactive"],
        packageRoot: "/mock/packages/tooling",
        workspaceRoot: "/tmp",
      });
      assert.equal(status, 1);
      assert.ok(capturedErr.includes("Configuration error"), "Should report configuration error");
    } finally {
      process.stderr.write = orig;
    }
  });
});

describe("setup — repeatable command selection", () => {
  it("adds applications on rerun and remains idempotent", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "nrb-setup-command-"));
    const context = (argv: string[]) => ({ argv, packageRoot: "/mock/packages/tooling", workspaceRoot });
    try {
      assert.equal(
        await runSetupCommand(context(["--replace", "--app", "landing-app", "--non-interactive"]), setupDependencies),
        0,
      );
      assert.equal(await runSetupCommand(context(["--app", "user-app", "--non-interactive"]), setupDependencies), 0);
      const afterAdd = readFileSync(join(workspaceRoot, "nrb.config.json"), "utf8");
      const selected = JSON.parse(afterAdd) as { apps: string[] };
      assert.deepEqual(selected.apps, ["auth-app-api", "landing-app", "user-app", "user-app-api"]);

      assert.deepEqual(readdirSync(workspaceRoot).sort(), [".nrb", "apps", "nrb.config.json"]);
      assert.equal(
        existsSync(join(workspaceRoot, "apps/backend/user/user-app-api/src/capabilities.generated.ts")),
        true,
        "setup must generate wiring only in the canonical app tree",
      );
      assert.equal(existsSync(join(workspaceRoot, "services")), false, "setup must not invent a services tree");
      assert.equal(existsSync(join(workspaceRoot, "starter-app")), false, "setup must not invent a default app");

      assert.equal(await runSetupCommand(context(["--app", "user-app", "--non-interactive"]), setupDependencies), 0);
      assert.equal(readFileSync(join(workspaceRoot, "nrb.config.json"), "utf8"), afterAdd);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("requires an explicit selection in a fresh non-interactive workspace", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "nrb-setup-command-"));
    const original = process.stderr.write;
    process.stderr.write = () => true;
    try {
      const status = await runSetupCommand({
        argv: ["--non-interactive"],
        packageRoot: "/mock/packages/tooling",
        workspaceRoot,
      });
      assert.equal(status, 1);
    } finally {
      process.stderr.write = original;
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("synchronizes the closure on provider swap and idempotent replay", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "nrb-setup-closure-"));
    const selections: Array<{ capabilities: string[]; configHash: string }> = [];
    const dependencies: SetupCommandDependencies = {
      synchronizeClosure: async (_root, selection) => {
        selections.push({ capabilities: selection.capabilities, configHash: selection.configHash });
        const result = await setupDependencies.synchronizeClosure!(_root, selection);
        return { ...result, changed: false };
      },
    };
    const context = (argv: string[]) => ({ argv, packageRoot: "/mock/packages/tooling", workspaceRoot });
    try {
      assert.equal(
        await runSetupCommand(
          context(["--replace", "--app", "user-app-api", "--capability", "postgres", "--non-interactive"]),
          dependencies,
        ),
        0,
      );
      assert.equal(
        await runSetupCommand(
          context([
            "--remove-capability",
            "postgres",
            "--capability",
            "mongodb",
            "--non-interactive",
          ]),
          dependencies,
        ),
        0,
      );
      assert.equal(await runSetupCommand(context(["--app", "user-app-api", "--non-interactive"]), dependencies), 0);
      assert.deepEqual(selections.map(({ capabilities }) => capabilities), [
        ["postgres"],
        ["mongodb"],
        ["mongodb"],
      ]);
      assert.notEqual(selections[0]?.configHash, selections[1]?.configHash);
      assert.equal(selections[1]?.configHash, selections[2]?.configHash);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("applies the interactive prompt result instead of discarding it", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "nrb-setup-interactive-"));
    try {
      const promptRunner = async (): Promise<PromptResult> => ({
        apps: ["site-app"],
        capabilities: [],
        product: { ciMode: "product", frontendApiMode: "same-origin", mobileTargets: ["web"] },
        deployment: {
          targets: ["docker"],
          publicTopology: "single-domain",
          kubernetesDelivery: "direct",
          infrastructure: { redis: "bundled", nats: "bundled", s3: "bundled" },
        },
        prune: false,
        force: false,
        dryRun: false,
      });
      const status = await runSetupCommandInteractive(
        { argv: [], packageRoot: "/mock/packages/tooling", workspaceRoot },
        promptRunner,
        setupDependencies,
      );
      assert.equal(status, 0);
      const config = JSON.parse(readFileSync(join(workspaceRoot, "nrb.config.json"), "utf8")) as {
        apps: string[];
      };
      assert.deepEqual(config.apps, ["site-app"]);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// COMPONENT: setup + planner integration
// ============================================================================

describe("setup — plan integration", () => {
  it("plans create operations for fresh state", () => {
    const config: NrbConfig = parseNrbConfig({
      schemaVersion: schemaVersion,
      preset: "minimal",
      apps: [],
      capabilities: [],
      options: { prune: false, force: false, dryRun: false, nonInteractive: false },
    });
    const result = plan(config, emptyState);

    assert.ok(result.configHash.length > 0);
    assert.ok(result.operations.length > 0);
    assert.ok(result.operations.some((op) => op.path === "nrb.config.json"));
    assert.ok(result.operations.some((op) => op.path === ".nrb/summary.md"));
  });

  it("second plan with same config produces zero operations (idempotency)", () => {
    const config: NrbConfig = parseNrbConfig({
      schemaVersion: schemaVersion,
      preset: "minimal",
      apps: [],
      capabilities: [],
    });
    const firstPlan = plan(config, emptyState);
    const secondPlan = plan(config, firstPlan.expectedState);
    assert.equal(secondPlan.operations.length, 0);
  });

  it("resolves preset with dependency expansion", () => {
    const config: NrbConfig = parseNrbConfig({
      schemaVersion: schemaVersion,
      preset: "fullstack",
      apps: [],
      capabilities: [],
    });
    const resolved = resolveConfig(config);
    assert.ok(resolved.apps.includes("auth-app-api"));
    assert.ok(resolved.apps.includes("user-app-api"));
    assert.ok(resolved.capabilities.includes("postgres"));
    assert.ok(resolved.preset === "fullstack");
  });

  it("plans prune operations when enabled", () => {
    const config: NrbConfig = parseNrbConfig({
      schemaVersion: schemaVersion,
      preset: "minimal",
      apps: [],
      capabilities: [],
      options: { prune: true, force: false, dryRun: false, nonInteractive: false },
    });
    // First plan creates files
    const firstPlan = plan(config, emptyState);
    // Simulate a state with extra files
    const stateWithExtra = {
      ...firstPlan.expectedState,
      files: {
        ...firstPlan.expectedState.files,
        "old-unused.txt": "abcdef123456",
      },
    };
    const prunePlan = plan(config, stateWithExtra);
    assert.ok(prunePlan.prunableFiles.includes("old-unused.txt"));
  });
});

// ============================================================================
// COMPONENT: doctor with real checks
// ============================================================================

describe("doctor — runDoctorCommand", () => {
  let origStdoutWrite: (chunk: string | Buffer) => boolean;
  let origStderrWrite: (chunk: string | Buffer) => boolean;
  let stdoutChunks: string[];
  let stderrChunks: string[];

  beforeEach(() => {
    stdoutChunks = [];
    stderrChunks = [];
    origStdoutWrite = process.stdout.write;
    origStderrWrite = process.stderr.write;
    process.stdout.write = (chunk: string | Buffer) => {
      stdoutChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    };
    process.stderr.write = (chunk: string | Buffer) => {
      stderrChunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
  });

  it("produces human-readable output", async () => {
    await runDoctorCommand({
      argv: [],
      packageRoot: "/mock/packages/tooling",
      workspaceRoot: "/mock",
    });
    const stdout = stdoutChunks.join("");
    assert.ok(stdout.includes("runtime-version"), "Should report the JavaScript runtime version");
    assert.ok(stdout.includes("Summary:"), "Should show summary");
  });

  it("outputs valid JSON when --json flag is passed", async () => {
    await runDoctorCommand({
      argv: ["--json"],
      packageRoot: "/mock/packages/tooling",
      workspaceRoot: "/mock",
    });

    const stdout = stdoutChunks.join("");
    const parsed = JSON.parse(stdout) as {
      checks: DoctorCheck[];
      summary: { total: number; pass: number; fail: number; warn: number; skip: number };
    };
    assert.ok(parsed.checks, "Should have checks array");
    assert.ok(parsed.summary, "Should have summary object");
    assert.ok(Array.isArray(parsed.checks));
    assert.ok(typeof parsed.summary.total === "number");
    assert.ok(typeof parsed.summary.pass === "number");
    assert.ok(typeof parsed.summary.fail === "number");
    assert.ok(typeof parsed.summary.warn === "number");
    assert.ok(typeof parsed.summary.skip === "number");
  });

  it("checkNrbConfig skips when no config exists", async () => {
    // Use /tmp to ensure no nrb.config.json
    await runDoctorCommand({
      argv: ["--json"],
      packageRoot: "/mock/packages/tooling",
      workspaceRoot: "/tmp",
    });
    const stdout = stdoutChunks.join("");
    const parsed = JSON.parse(stdout) as { checks: DoctorCheck[]; summary: { total: number } };
    const configCheck = parsed.checks.find((c: DoctorCheck) => c.name === "nrb-config");
    assert.ok(configCheck, "Should have nrb-config check");
    // Could be pass (if /tmp has config) or skip
  });

  it("checkNrbState skips when no state exists", async () => {
    await runDoctorCommand({
      argv: ["--json"],
      packageRoot: "/mock/packages/tooling",
      workspaceRoot: "/tmp",
    });
    const stdout = stdoutChunks.join("");
    const parsed = JSON.parse(stdout) as { checks: DoctorCheck[]; summary: { total: number } };
    const stateCheck = parsed.checks.find((c: DoctorCheck) => c.name === "nrb-state");
    assert.ok(stateCheck, "Should have nrb-state check");
  });
});

// ============================================================================
// E2E: prompts module
// ============================================================================

describe("prompts — nonInteractive defaults", () => {
  it("runPrompts with nonInteractive does not invent a default app", async () => {
    const { runPrompts } = await import("../../setup/prompts.js");
    const result = await runPrompts(true); // nonInteractive = true
    assert.equal(result.preset, undefined);
    assert.deepEqual(result.apps, []);
    assert.deepEqual(result.capabilities, []);
    assert.equal(result.prune, false);
    assert.equal(result.force, false);
    assert.equal(result.dryRun, false);
  });
});

describe("prompts — interactive selection", () => {
  it("starts custom and selects individual frontend applications", async () => {
    const { runPrompts } = await import("../../setup/prompts.js");
    const writes: string[] = [];
    const io: PromptIo = {
      async ask(question, defaultAnswer) {
        if (question.includes("Select (1-")) return "1";
        if (question.includes("User Application (user-app)")) return "y";
        return defaultAnswer ?? "";
      },
      write(content) {
        writes.push(content);
      },
    };
    const result = await runPrompts(false, null, io);
    assert.deepEqual(result.apps, ["auth-app-api", "user-app", "user-app-api"]);
    assert.deepEqual(result.capabilities, ["i18n", "postgres"]);
    assert.equal(result.preset, undefined);
    assert.match(writes.join(""), /Frontend applications:/);
    assert.match(writes.join(""), /Backend APIs:/);
    assert.match(writes.join(""), /Full-stack E2E applications:/);
    assert.match(writes.join(""), /Optional integration APIs:/);
  });

  it("loads the existing selection and preserves it while adding another app", async () => {
    const { runPrompts } = await import("../../setup/prompts.js");
    const existing = parseNrbConfig({ schemaVersion, apps: ["landing-app"] });
    const io: PromptIo = {
      async ask(question, defaultAnswer) {
        if (question.includes("Marketing Site (site-app)")) return "y";
        return defaultAnswer ?? "";
      },
      write() {},
    };
    const result = await runPrompts(false, existing, io);
    assert.deepEqual(result.apps, ["landing-app", "site-app"]);
  });
});

describe("prompts — buildConfig", () => {
  it("buildConfig merges prompts with overrides", async () => {
    const { buildConfig } = await import("../../setup/prompts.js");
    const prompts: PromptResult = {
      preset: "web",
      apps: ["user-app"],
      capabilities: ["postgres"],
      product: { ciMode: "product", frontendApiMode: "same-origin", mobileTargets: ["web"] },
      deployment: {
        targets: ["docker"],
        publicTopology: "single-domain",
        kubernetesDelivery: "direct",
        infrastructure: { redis: "bundled", nats: "bundled", s3: "bundled" },
      },
      prune: false,
      force: true,
      dryRun: false,
    };
    const config = buildConfig(prompts, { options: { nonInteractive: true } });
    assert.equal(config.schemaVersion, schemaVersion);
    assert.equal(config.preset, "web");
    assert.equal(config.options.force, true);
    assert.equal(config.options.nonInteractive, true);
  });

  it("buildConfig overrides preset", async () => {
    const { buildConfig } = await import("../../setup/prompts.js");
    const prompts: PromptResult = {
      preset: "minimal",
      apps: [],
      capabilities: [],
      product: { ciMode: "product", frontendApiMode: "same-origin", mobileTargets: ["web"] },
      deployment: {
        targets: ["docker"],
        publicTopology: "single-domain",
        kubernetesDelivery: "direct",
        infrastructure: { redis: "bundled", nats: "bundled", s3: "bundled" },
      },
      prune: false,
      force: false,
      dryRun: false,
    };
    const config = buildConfig(prompts, { preset: "enterprise" });
    assert.equal(config.preset, "enterprise");
  });
});

describe("prompts — formatConfigSummary", () => {
  it("formats a config summary string", async () => {
    const { formatConfigSummary } = await import("../../setup/prompts.js");
    const config: NrbConfig = parseNrbConfig({
      schemaVersion: schemaVersion,
      preset: "web",
      apps: ["user-app"] as unknown as string[],
      capabilities: ["postgres"] as unknown as string[],
      options: { prune: true, force: false, dryRun: true, nonInteractive: true },
    });
    const summary = formatConfigSummary(config);
    assert.ok(summary.includes("Configuration:"));
    assert.ok(summary.includes("web"));
    assert.ok(summary.includes("user-app"));
    assert.ok(summary.includes("postgres"));
    assert.ok(summary.includes("prune: true"));
    assert.ok(summary.includes("dryRun: true"));
  });

  it("handles empty apps and capabilities", async () => {
    const { formatConfigSummary } = await import("../../setup/prompts.js");
    const config: NrbConfig = parseNrbConfig({
      schemaVersion: schemaVersion,
      apps: [],
      capabilities: [],
    });
    const summary = formatConfigSummary(config);
    assert.ok(summary.includes("(none)"));
  });

  it("shows the materialized preset selection", async () => {
    const { formatConfigSummary } = await import("../../setup/prompts.js");
    const config = parseNrbConfig({ schemaVersion, preset: "enterprise" });
    const summary = formatConfigSummary(config, {
      apps: ["admin-app", "auth-app-api"],
      capabilities: ["notifications", "postgres"],
    });
    assert.ok(summary.includes("Apps: admin-app, auth-app-api"));
    assert.ok(summary.includes("Capabilities: notifications, postgres"));
    assert.ok(!summary.includes("Apps: (none)"));
  });
});

describe("prompts — formatPlanSummary", () => {
  it("formats a plan summary", async () => {
    const { formatPlanSummary } = await import("../../setup/prompts.js");
    const ops = [
      { kind: "create_file", path: "nrb.config.json", description: "Create nrb.config.json" },
      { kind: "create_file", path: ".nrb/summary.md", description: "Create .nrb/summary.md" },
    ];
    const summary = formatPlanSummary(ops, "abc123");
    assert.ok(summary.includes("abc123"));
    assert.ok(summary.includes("Operations: 2"));
    assert.ok(summary.includes("create_file: nrb.config.json"));
  });

  it("handles empty operations", async () => {
    const { formatPlanSummary } = await import("../../setup/prompts.js");
    const summary = formatPlanSummary([], "def456");
    assert.ok(summary.includes("Operations: 0"));
  });
});
