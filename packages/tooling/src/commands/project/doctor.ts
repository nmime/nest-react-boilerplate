/**
 * Doctor command — health checks for the workspace.
 *
 * Checks:
 *   - JavaScript runtime version (Node.js or Bun)
 *   - pnpm availability and version
 *   - Docker availability (optional)
 *   - Manifest files (package.json, tsconfig.base.json)
 *   - pnpm-lock.yaml presence
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
import { delimiter, join } from "node:path";
import { execFileSync } from "node:child_process";
import type { CommandContext } from "../../cli.js";
import { safeParseNrbConfig, schemaVersion } from "../../setup/schema.js";
import { configHash, migrateState, emptyState, hashString } from "../../setup/state.js";
import {
  generateBackendCapabilityBootstrap,
  generateBackendCapabilityModule,
  generateCapabilitiesManifest,
  generateCapabilityMigrationRegistry,
  generateComposeEnvironment,
  resolveConfig,
  type PlanSummary,
} from "../../setup/planner.js";
import { backendCapabilityModuleCatalog } from "../../setup/catalog.js";
import { parseGeneratedEnvironment } from "../../setup/environment.js";
import { detectJavaScriptRuntime, type JavaScriptRuntimeInfo } from "../../runtime/environment.js";
import {
  validateGeneratedSelectionEnvironment,
  validateSelectedComposeServices,
  validateSelectedDatabaseEnvironment,
} from "../docker/selected.js";
import { checkClosureArtifacts } from "../../setup/closure-materializer.js";
import {
  buildConfiguredClosure,
  readConfiguredClosure,
  readConfiguredSelection,
} from "../../setup/closure-workspace.js";

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
      name: "runtime-version",
      status: "fail",
      message: `Node.js ${version} — repository requires >=24 <25`,
    };
  }
  return { name: "runtime-version", status: "pass", message: `Node.js ${version}` };
}

export function checkBunVersion(version: string, expectedVersion = "1.3.14"): DoctorCheck {
  if (version !== expectedVersion) {
    return {
      name: "runtime-version",
      status: "fail",
      message: `Bun ${version} — repository requires exactly ${expectedVersion}`,
    };
  }
  return { name: "runtime-version", status: "pass", message: `Bun ${version}` };
}

export function checkJavaScriptRuntime(
  runtime: JavaScriptRuntimeInfo = detectJavaScriptRuntime(),
  expectedBunVersion = "1.3.14",
): DoctorCheck {
  return runtime.name === "bun"
    ? checkBunVersion(runtime.version, expectedBunVersion)
    : checkNodeVersion(`v${runtime.version}`);
}

export function checkPnpmVersion(version: string): DoctorCheck {
  if (version !== "11.15.1") {
    return {
      name: "pnpm",
      status: "fail",
      message: `pnpm ${version} — repository requires exactly 11.15.1`,
    };
  }
  return { name: "pnpm", status: "pass", message: `pnpm ${version}` };
}

function checkPnpm(runtime: JavaScriptRuntimeInfo = detectJavaScriptRuntime()): DoctorCheck {
  try {
    const invocation = pnpmVersionInvocation(runtime);
    const output = execFileSync(invocation.command, invocation.args, { encoding: "utf8", timeout: 10000 });
    return checkPnpmVersion(output.trim());
  } catch {
    return {
      name: "pnpm",
      status: "fail",
      message: "pnpm not found — install pnpm 11.15.1 through Corepack",
    };
  }
}

function pnpmVersionInvocation(runtime: JavaScriptRuntimeInfo): { command: string; args: string[] } {
  if (runtime.name !== "bun" || process.platform === "win32") {
    return { command: "pnpm", args: ["--version"] };
  }

  const nodeExecutable = executableCandidates("node").find((candidate) => {
    try {
      return /^v24\./u.test(
        execFileSync(candidate, ["--version"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 5000,
        }).trim(),
      );
    } catch {
      return false;
    }
  });
  const pnpmExecutable = executableCandidates("pnpm")[0];

  return nodeExecutable && pnpmExecutable
    ? { command: nodeExecutable, args: [pnpmExecutable, "--version"] }
    : { command: "pnpm", args: ["--version"] };
}

function executableCandidates(command: string): string[] {
  const executableNames = process.platform === "win32" ? [`${command}.cmd`, `${command}.exe`, command] : [command];
  return (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .flatMap((directory) => executableNames.map((name) => join(directory, name)))
    .filter((candidate) => existsSync(candidate));
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

export function checkNrbState(workspaceRoot: string): DoctorCheck {
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
    const driftedFiles = Object.entries(state.files)
      .filter(([relativePath, expectedHash]) => {
        const trackedPath = join(workspaceRoot, relativePath);
        return !existsSync(trackedPath) || hashString(readFileSync(trackedPath, "utf8")) !== expectedHash;
      })
      .map(([relativePath]) => relativePath);
    if (driftedFiles.length > 0) {
      return {
        name: "nrb-state",
        status: "fail",
        message: `Generated setup files drifted: ${driftedFiles.join(", ")} — rerun setup`,
      };
    }
    const fileCount = Object.keys(state.files).length;
    return { name: "nrb-state", status: "pass", message: `.nrb/state.json valid (${fileCount} tracked files)` };
  } catch (err: unknown) {
    return { name: "nrb-state", status: "fail", message: `Failed to parse .nrb/state.json: ${errorMessage(err)}` };
  }
}

export function checkCapabilityActivation(workspaceRoot: string): DoctorCheck {
  const configPath = join(workspaceRoot, "nrb.config.json");
  if (!existsSync(configPath)) {
    return { name: "capability-wiring", status: "skip", message: "Run setup to activate capabilities" };
  }
  try {
    const parsed = safeParseNrbConfig(JSON.parse(readFileSync(configPath, "utf8")));
    if (!parsed.success) {
      return { name: "capability-wiring", status: "fail", message: "Cannot verify an invalid nrb.config.json" };
    }
    const resolved = resolveConfig(parsed.data);
    const summary = {
      apps: resolved.apps,
      capabilities: resolved.capabilities,
      product: parsed.data.product,
      deployment: parsed.data.deployment,
      preset: resolved.preset,
      configHash: configHash(parsed.data),
    } satisfies PlanSummary;
    const expected = [
      generateCapabilitiesManifest(summary),
      generateComposeEnvironment(summary),
      generateCapabilityMigrationRegistry(summary),
      ...Object.keys(backendCapabilityModuleCatalog).map((appId) =>
        generateBackendCapabilityModule(appId as (typeof resolved.apps)[number], summary),
      ),
      ...Object.keys(backendCapabilityModuleCatalog).map((appId) =>
        generateBackendCapabilityBootstrap(appId as (typeof resolved.apps)[number], summary),
      ),
    ];
    const drifted = expected
      .filter((file) => {
        const path = join(workspaceRoot, file.path);
        return !existsSync(path) || readFileSync(path, "utf8") !== file.content;
      })
      .map((file) => file.path);
    return drifted.length === 0
      ? {
          name: "capability-wiring",
          status: "pass",
          message: `${resolved.capabilities.length} capabilities activated deterministically`,
        }
      : {
          name: "capability-wiring",
          status: "fail",
          message: `Generated capability files drifted: ${drifted.join(", ")} — rerun setup`,
        };
  } catch (err: unknown) {
    return { name: "capability-wiring", status: "fail", message: `Capability check failed: ${errorMessage(err)}` };
  }
}

export function checkComposeSelection(workspaceRoot: string): DoctorCheck {
  const environmentPath = join(workspaceRoot, ".nrb", "capabilities.env");
  const composePath = join(workspaceRoot, "docker", "docker-compose.yml");
  if (!existsSync(environmentPath) || !existsSync(composePath)) {
    return {
      name: "compose-selection",
      status: "skip",
      message: "Run setup to materialize the selected Compose profile",
    };
  }

  let selectedEnvironment: Record<string, string>;
  let provider: ReturnType<typeof validateSelectedDatabaseEnvironment>;
  let expectedServices: string[];
  try {
    const closure = readConfiguredClosure(workspaceRoot);
    const selection = readConfiguredSelection(workspaceRoot);
    selectedEnvironment = parseGeneratedEnvironment(readFileSync(environmentPath, "utf8"));
    validateGeneratedSelectionEnvironment(closure, selection, selectedEnvironment);
    provider = validateSelectedDatabaseEnvironment(closure.provider, selectedEnvironment);
    expectedServices = closure.services;
  } catch (err: unknown) {
    return {
      name: "compose-selection",
      status: "fail",
      message: `Invalid selected database state: ${errorMessage(err)} — rerun setup`,
    };
  }

  try {
    execFileSync("docker", ["--version"], { encoding: "utf8", timeout: 10000 });
  } catch {
    return {
      name: "compose-selection",
      status: "skip",
      message: `Docker not available — selected ${provider ?? "provider-free"} Compose graph was not checked`,
    };
  }

  try {
    const services = execFileSync(
      "docker",
      ["compose", "--env-file", environmentPath, "-f", composePath, "config", "--services"],
      {
        cwd: workspaceRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          ...selectedEnvironment,
          NRB_CLOSURE_CONTEXT: join(workspaceRoot, ".nrb", "closure"),
        },
        timeout: 30000,
      },
    )
      .split(/\r?\n/u)
      .filter(Boolean);
    validateSelectedComposeServices(provider, expectedServices, services);
    return {
      name: "compose-selection",
      status: "pass",
      message: `Selected ${provider ?? "provider-free"} Compose service graph resolves`,
    };
  } catch (err: unknown) {
    return {
      name: "compose-selection",
      status: "fail",
      message: `Selected ${provider ?? "provider-free"} Compose service graph is invalid: ${errorMessage(err)}`,
    };
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

export async function checkSelectedClosure(workspaceRoot: string): Promise<DoctorCheck> {
  if (!existsSync(join(workspaceRoot, "nrb.config.json"))) {
    return { name: "selected-closure", status: "skip", message: "Run setup to generate a selected closure" };
  }
  try {
    const expected = await buildConfiguredClosure(workspaceRoot);
    const actual = readConfiguredClosure(workspaceRoot);
    const checked = checkClosureArtifacts(workspaceRoot, expected);
    if (!checked.valid || JSON.stringify(actual) !== JSON.stringify(expected)) {
      return {
        name: "selected-closure",
        status: "fail",
        message: `${checked.problems.join(", ") || ".nrb/closure.json does not match the live Nx graph"} — rerun setup`,
      };
    }
    if (checked.lockStatus === "stale") {
      return {
        name: "selected-closure",
        status: "fail",
        message: "Selected pnpm lock is stale — run `pnpm nrb closure install`",
      };
    }
    if (checked.lockStatus === "missing") {
      return {
        name: "selected-closure",
        status: "warn",
        message: `${actual.projects.length} projects selected; run \`pnpm nrb closure install\` when a scoped install is needed`,
      };
    }
    return {
      name: "selected-closure",
      status: "pass",
      message: `${actual.projects.length} projects, ${Object.keys(actual.productExternalPackages ?? {}).length} product packages, and ${Object.keys(actual.toolingExternalPackages ?? {}).length} tooling packages resolve`,
    };
  } catch (err: unknown) {
    return { name: "selected-closure", status: "fail", message: `${errorMessage(err)} — rerun setup` };
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

  const runtime = detectJavaScriptRuntime();
  const checks: DoctorCheck[] = [
    checkJavaScriptRuntime(runtime, readPinnedBunVersion(workspaceRoot)),
    checkPnpm(runtime),
    checkDocker(),
    checkManifests(workspaceRoot),
    checkLockFile(workspaceRoot),
    checkNxGraph(workspaceRoot),
    checkNrbConfig(workspaceRoot),
    checkNrbState(workspaceRoot),
    checkCapabilityActivation(workspaceRoot),
    checkComposeSelection(workspaceRoot),
    checkToolingPackage(workspaceRoot),
    await checkSelectedClosure(workspaceRoot),
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

function readPinnedBunVersion(workspaceRoot: string): string {
  const path = join(workspaceRoot, ".bun-version");
  return existsSync(path) ? readFileSync(path, "utf8").trim() : "1.3.14";
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
