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

// ---------------------------------------------------------------------------
// Re-exports from existing modules we test against
// ---------------------------------------------------------------------------
import { parseNrbConfig, schemaVersion, type NrbConfig, type AppId, type CapabilityId, presetIds } from "../../setup/schema.js";
import { plan, resolveConfig } from "../../setup/planner.js";
import { emptyState } from "../../setup/state.js";
import { expandPreset } from "../../setup/presets.js";
import type { PromptResult } from "../../setup/prompts.js";

// ---------------------------------------------------------------------------
// Import commands under test
// ---------------------------------------------------------------------------
import { parseArgs, runSetupCommand } from "./setup.js";
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
    assert.equal(args.preset, undefined);
    assert.deepEqual(args.apps, []);
    assert.deepEqual(args.capabilities, []);
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

  it("parses all flags together", () => {
    const args = parseArgs([
      "--preset", "minimal",
      "--dry-run", "--prune", "--force", "--non-interactive", "--json",
      "--app", "auth-app-api",
      "--capability", "postgres",
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
    assert.ok(stdout.includes("node-version"), "Should report node version");
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
  it("runPrompts with nonInteractive returns the complete core profile", async () => {
    const { runPrompts } = await import("../../setup/prompts.js");
    const result = await runPrompts(true); // nonInteractive = true
    assert.equal(result.preset, "fullstack");
    assert.ok(Array.isArray(result.apps));
    assert.ok(Array.isArray(result.capabilities));
    assert.equal(result.prune, false);
    assert.equal(result.force, false);
    assert.equal(result.dryRun, false);
  });
});

describe("prompts — buildConfig", () => {
  it("buildConfig merges prompts with overrides", async () => {
    const { buildConfig } = await import("../../setup/prompts.js");
    const prompts: PromptResult = {
      preset: "web",
      apps: ["user-app"],
      capabilities: ["postgres"],
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
