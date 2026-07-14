/**
 * Doctor command — health checks for the workspace.
 *
 * Checks:
 *   - Node.js version
 *   - pnpm availability and version
 *   - Docker availability (optional)
 *   - Manifest files (package.json, tsconfig.base.json)
 *   - pnpm-lock.yaml freshness
 *   - Nx project graph (optional)
 *   - NRB config validity
 *   - NRB state consistency
 *
 * Usage:
 *   pnpm nrb doctor
 *   repo-tooling project doctor
 *   repo-tooling project doctor --json
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { CommandContext } from "../../cli.js";
import { safeParseNrbConfig, schemaVersion } from "../../setup/schema.js";
import { migrateState, emptyState } from "../../setup/state.js";

// ---------------------------------------------------------------------------
// Check types
// ---------------------------------------------------------------------------

export interface DoctorCheck {
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

export function checkNodeVersion(version = process.version): DoctorCheck {
  const major = parseInt(version.slice(1).split(".")[0], 10);
  if (!Number.isInteger(major) || major !== 24) {
    return {
      name: "node-version",
      status: "fail",
      message: `Node.js ${version} — repository requires >=24 <25`,
    };
  }
  return { name: "node-version", status: "pass", message: `Node.js ${version}` };
}

export function checkPnpmVersion(version: string): DoctorCheck {
  if (version !== "11.11.0") {
    return {
      name: "pnpm",
      status: "fail",
      message: `pnpm ${version} — repository requires exactly 11.11.0`,
    };
  }
  return { name: "pnpm", status: "pass", message: `pnpm ${version}` };
}

function checkPnpm(): DoctorCheck {
  try {
    const output = execFileSync("pnpm", ["--version"], { encoding: "utf8", timeout: 10000 });
    return checkPnpmVersion(output.trim());
  } catch {
    return {
      name: "pnpm",
      status: "fail",
      message: "pnpm not found — install pnpm 11.11.0 through Corepack",
    };
  }
}

function checkDocker(): DoctorCheck {
  try {
    const output = execFileSync("docker", ["--version"], { encoding: "utf8", timeout: 10000 });
    return { name: "docker", status: "pass", message: output.trim() };
  } catch {
    return { name: "docker", status: "skip", message: "Docker not available — optional for E2E tests" };
  }
}

function checkManifests(workspaceRoot: string): DoctorCheck {
  const files = ["package.json", "tsconfig.base.json"];
  const missing = files.filter((f) => !existsSync(join(workspaceRoot, f)));
  if (missing.length > 0) {
    return { name: "manifests", status: "fail", message: `Missing: ${missing.join(", ")}` };
  }
  return { name: "manifests", status: "pass", message: "package.json, tsconfig.base.json present" };
}

function checkLockFile(workspaceRoot: string): DoctorCheck {
  const lockPath = join(workspaceRoot, "pnpm-lock.yaml");
  if (!existsSync(lockPath)) {
    return { name: "lock-file", status: "warn", message: "pnpm-lock.yaml not found — run pnpm install" };
  }
  return { name: "lock-file", status: "pass", message: "pnpm-lock.yaml present" };
}

function checkNxGraph(workspaceRoot: string): DoctorCheck {
  try {
    const nxBin = join(workspaceRoot, "node_modules", ".bin", process.platform === "win32" ? "nx.cmd" : "nx");
    if (!existsSync(nxBin)) {
      return { name: "nx-graph", status: "warn", message: "Nx is not installed — run pnpm install" };
    }
    const output = execFileSync(nxBin, ["show", "project", "@repo/tooling", "--json"], {
      encoding: "utf8",
      timeout: 15000,
      cwd: workspaceRoot,
    });
    JSON.parse(output);
    return { name: "nx-graph", status: "pass", message: "Nx project graph resolves" };
  } catch {
    return { name: "nx-graph", status: "warn", message: "Unable to resolve Nx project graph" };
  }
}

function checkNrbConfig(workspaceRoot: string): DoctorCheck {
  const configPath = join(workspaceRoot, "nrb.config.json");
  if (!existsSync(configPath)) {
    return { name: "nrb-config", status: "skip", message: "nrb.config.json not found — run setup to create" };
  }
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    const result = safeParseNrbConfig(raw);
    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return { name: "nrb-config", status: "fail", message: `Invalid config: ${errors}` };
    }
    if (result.data.schemaVersion !== schemaVersion) {
      return { name: "nrb-config", status: "warn", message: `Config schema version ${result.data.schemaVersion} — expected ${schemaVersion}` };
    }
    return { name: "nrb-config", status: "pass", message: `nrb.config.json valid (v${result.data.schemaVersion})` };
  } catch (err: unknown) {
    return { name: "nrb-config", status: "fail", message: `Failed to parse nrb.config.json: ${errorMessage(err)}` };
  }
}

function checkNrbState(workspaceRoot: string): DoctorCheck {
  const statePath = join(workspaceRoot, ".nrb", "state.json");
  if (!existsSync(statePath)) {
    return { name: "nrb-state", status: "skip", message: ".nrb/state.json not found — no setup state" };
  }
  try {
    const raw = JSON.parse(readFileSync(statePath, "utf8"));
    const state = migrateState(raw);
    if (state === emptyState) {
      return { name: "nrb-state", status: "warn", message: "State file is empty or invalid — may need re-setup" };
    }
    const fileCount = Object.keys(state.files).length;
    return { name: "nrb-state", status: "pass", message: `.nrb/state.json valid (${fileCount} tracked files)` };
  } catch (err: unknown) {
    return { name: "nrb-state", status: "fail", message: `Failed to parse .nrb/state.json: ${errorMessage(err)}` };
  }
}

function checkToolingPackage(workspaceRoot: string): DoctorCheck {
  const pkgPath = join(workspaceRoot, "packages", "tooling", "package.json");
  if (!existsSync(pkgPath)) {
    return { name: "tooling-package", status: "fail", message: "@repo/tooling package.json not found" };
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const hasRepoTooling = !!pkg.bin?.["repo-tooling"];
    const hasNrb = !!pkg.bin?.["nrb"];
    if (!hasRepoTooling) {
      return { name: "tooling-package", status: "fail", message: "@repo/tooling missing repo-tooling bin entry" };
    }
    if (!hasNrb) {
      return { name: "tooling-package", status: "warn", message: "@repo/tooling missing nrb bin entry" };
    }
    return { name: "tooling-package", status: "pass", message: `@repo/tooling v${pkg.version} — repo-tooling + nrb bins present` };
  } catch (err: unknown) {
    return { name: "tooling-package", status: "fail", message: `Failed to parse tooling package.json: ${errorMessage(err)}` };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function runDoctorCommand(
  context: CommandContext,
): Promise<number> {
  const { workspaceRoot } = context;
  const jsonOutput = context.argv.includes("--json");

  const checks: DoctorCheck[] = [
    checkNodeVersion(),
    checkPnpm(),
    checkDocker(),
    checkManifests(workspaceRoot),
    checkLockFile(workspaceRoot),
    checkNxGraph(workspaceRoot),
    checkNrbConfig(workspaceRoot),
    checkNrbState(workspaceRoot),
    checkToolingPackage(workspaceRoot),
  ];

  if (jsonOutput) {
    const result = {
      checks,
      summary: {
        total: checks.length,
        pass: checks.filter((c) => c.status === "pass").length,
        fail: checks.filter((c) => c.status === "fail").length,
        warn: checks.filter((c) => c.status === "warn").length,
        skip: checks.filter((c) => c.status === "skip").length,
      },
    };
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return result.summary.fail > 0 ? 1 : 0;
  }

  // Human-readable output
  const symbols: Record<string, string> = {
    pass: "✓",
    fail: "✗",
    warn: "⚠",
    skip: "○",
  };

  for (const check of checks) {
    process.stdout.write(`  ${symbols[check.status]} ${check.name.padEnd(20)} ${check.message}\n`);
  }

  process.stdout.write("\n");
  const summary = {
    total: checks.length,
    pass: checks.filter((c) => c.status === "pass").length,
    fail: checks.filter((c) => c.status === "fail").length,
    warn: checks.filter((c) => c.status === "warn").length,
    skip: checks.filter((c) => c.status === "skip").length,
  };
  process.stdout.write(
    `Summary: ${summary.pass} passed, ${summary.fail} failed, ${summary.warn} warnings, ${summary.skip} skipped\n`,
  );

  return summary.fail > 0 ? 1 : 0;
}

/** Entry point for CLI registration. */
export async function runDoctorFromContext(
  context: CommandContext,
): Promise<number> {
  return runDoctorCommand(context);
}

/** Extract a safe error message from any thrown value. */
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}
