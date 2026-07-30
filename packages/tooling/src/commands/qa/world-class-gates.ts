#!/usr/bin/env node
// Evidence for: REQ-ASSURANCE-FRESHNESS-002 REQ-AUTH-AUDIT-008 REQ-NOTIFY-LIFECYCLE-002 REQ-RUNTIME-HEALTH-001 REQ-RUNTIME-MESSAGING-006 REQ-RUNTIME-OBSERVABILITY-005 REQ-RUNTIME-RECOVERY-002 REQ-SCAFFOLD-QUALITY-006 REQ-SOCIAL-LIFECYCLE-005 REQ-SOCIAL-SESSION-002
// Scheduled operations evidence for REQ-ASSURANCE-FRESHNESS-002,
// REQ-NOTIFY-LIFECYCLE-002, REQ-RUNTIME-HEALTH-001,
// REQ-RUNTIME-RECOVERY-002, and REQ-SOCIAL-SESSION-002.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dockerAvailable } from "../db/postgres-client.ts";
import { crossBrowserProjects } from "./browser-matrix.ts";
import { commandExists, envList, ensureDir, packageManagerInvocation, parseArgs, readJson, run, writeJson } from "./runtime-utils.ts";
import {
  boundedInteger,
  disallowedRequiredSkips,
  parseCommandArgv,
  unknownWorldClassGates,
  worldClassGateNames,
} from "./world-class-policy.ts";

const args = parseArgs();
if (args.flags.has("dry-run")) {
  console.error("world-class gates are runtime-backed and do not support --dry-run; configure real commands/URLs instead.");
  process.exit(2);
}

const reportPath = args.options.get("report") ?? "test-results/world-class/report.json";
const selectedGates = new Set(
  (args.options.get("gate") ?? process.env.WORLD_CLASS_GATES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const unknownGates = unknownWorldClassGates(selectedGates);
if (unknownGates.length) {
  console.error(`Unknown world-class gate(s): ${unknownGates.join(", ")}`);
  process.exit(2);
}
const scripts = readJson<{ scripts?: Record<string, string> }>("package.json").scripts ?? {};

/** Free-form evidence object each gate returns; fields vary by gate. */
type GateEvidence = Record<string, unknown>;

interface GateResult {
  name: string;
  status: "ok" | "failed" | "skipped";
  durationMs?: number;
  evidence?: GateEvidence;
  message?: string;
  details?: Record<string, unknown>;
}

interface ProbeOptions {
  expectedStatuses?: Set<number>;
  allowNonServerError?: boolean;
}

interface ProbeResult {
  url: string;
  status: number;
  durationMs: number;
  bytes: number;
}

interface ConfiguredCommand {
  argv: string[];
  source: string;
}

/** Reads the `.details` bag attached to gate assertion errors, if present. */
function gateDetails(error: unknown): Record<string, unknown> {
  if (error !== null && typeof error === "object" && "details" in error) {
    const details = (error as { details?: unknown }).details;
    if (details !== null && typeof details === "object") return details as Record<string, unknown>;
  }
  return {};
}

const results: GateResult[] = [];
const ciMode = process.env.CI === "true";
const allowCiSkips = process.env.WORLD_CLASS_ALLOW_CI_SKIPS === "1";
let backupRestoreEvidence: GateEvidence | undefined;

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function assertGate(condition: unknown, message: string, details: Record<string, unknown> = {}): asserts condition {
  if (condition) return;
  throw Object.assign(new Error(message), { details });
}

function requireScripts(names: string[]): void {
  for (const name of names) {
    assertGate(Boolean(scripts[name]), `Missing package script: ${name}`);
  }
}

function missingRuntimeGate(reason: string, details: Record<string, unknown> = {}): GateEvidence {
  return {
    status: ciMode && !allowCiSkips ? "failed" : "skipped",
    reason,
    details: { ...details, ciMode, allowCiSkipsEnv: "WORLD_CLASS_ALLOW_CI_SKIPS=1" },
  };
}

function missingAuthoritativeCommand(reason: string, details: Record<string, unknown> = {}): GateEvidence {
  return {
    status: "failed",
    reason,
    details: { ...details, commandFormat: '["program","arg",...]' },
  };
}

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)] ?? 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function tail(value: unknown, max = 2000): string {
  const text = String(value ?? "");
  return text.length > max ? text.slice(-max) : text;
}

function redact(value: unknown): string {
  return String(value ?? "")
    .replaceAll(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/giu, "$1***$2")
    .replaceAll(/([?&](?:token|key|secret|password)=)[^&\s]+/giu, "$1***")
    .replaceAll(/(authorization:\s*bearer\s+)[^\s]+/giu, "$1***");
}

function firstEnv(names: string[]): { name: string; value: string } | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
}

function assertNonDryRunCommand(argv: readonly string[], label: string): void {
  assertGate(!argv.some((value) => /(^|-)dry-run($|-)/iu.test(value)), `${label} must not use dry-run`, {
    command: redact(argv.join(" ")),
  });
}

function configuredCommand(names: string[], fallback: string[]): ConfiguredCommand;
function configuredCommand(names: string[], fallback?: string[]): ConfiguredCommand | null;
function configuredCommand(names: string[], fallback?: string[]): ConfiguredCommand | null {
  const fromEnv = firstEnv(names);
  if (fromEnv) return { argv: parseCommandArgv(fromEnv.value, fromEnv.name), source: fromEnv.name };
  if (fallback) return { argv: fallback, source: "ci-safe-local-default" };
  return null;
}

function runCommand(label: string, configured: ConfiguredCommand, extraEnv: NodeJS.ProcessEnv = {}): { commandHash: string; status: number; stdoutHash: string; stderrHash: string; timeoutMs: number } {
  assertNonDryRunCommand(configured.argv, label);
  const [requestedProgram, ...requestedArgs] = configured.argv;
  assertGate(requestedProgram, `${label} command must not be empty`);
  const invocation = requestedProgram === "pnpm"
    ? packageManagerInvocation(requestedArgs)
    : { command: requestedProgram, args: requestedArgs };
  const timeoutMs = boundedInteger({
    fallback: 1_800_000,
    label: "WORLD_CLASS_COMMAND_TIMEOUT_MS",
    max: 7_200_000,
    min: 100,
    value: process.env.WORLD_CLASS_COMMAND_TIMEOUT_MS,
  });
  const result = run(invocation.command, invocation.args, { env: extraEnv, timeoutMs });
  assertGate(result.status === 0, `${label} command failed`, {
    command: redact(configured.argv.join(" ")),
    status: result.status,
    stdout: redact(tail(result.stdout)),
    stderr: redact(tail(result.stderr)),
    error: result.error,
    signal: result.signal,
    timedOut: result.timedOut,
    timeoutMs,
  });
  return {
    commandHash: sha256(JSON.stringify(configured.argv)),
    status: result.status,
    stdoutHash: sha256(result.stdout ?? ""),
    stderrHash: sha256(result.stderr ?? ""),
    timeoutMs,
  };
}

function urlsFrom(...names: string[]): string[] {
  const urls: string[] = [];
  for (const name of names) urls.push(...envList(name));
  return [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
}

function focusedTestWorkers(): number {
  return boundedInteger({
    fallback: 2,
    label: "VITEST_MAX_WORKERS",
    max: 8,
    value: process.env.VITEST_MAX_WORKERS,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorContext(error: unknown): { message: string; details: Record<string, unknown> } {
  return {
    message: error instanceof Error ? error.message : String(error),
    details: gateDetails(error),
  };
}

async function probeUrl(url: string, options: ProbeOptions = {}): Promise<ProbeResult> {
  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
  } catch {
    assertGate(false, "Invalid runtime URL", { url });
  }
  assertGate(["http:", "https:"].includes(parsed.protocol), "Runtime probe URL must be HTTP(S)", { url });
  const started = performance.now();
  let response: Response | undefined;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(
        boundedInteger({
          fallback: 15_000,
          label: "QA_URL_TIMEOUT_MS",
          max: 120_000,
          min: 100,
          value: process.env.QA_URL_TIMEOUT_MS,
        }),
      ),
      headers: process.env.QA_CANARY_USER_AGENT ? { "user-agent": process.env.QA_CANARY_USER_AGENT } : undefined,
    });
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);
    assertGate(false, "Runtime URL probe failed", { url, durationMs, error: errorContext(error).message });
  }
  const body = await response.arrayBuffer();
  const durationMs = Math.round(performance.now() - started);
  const expected = options.expectedStatuses ?? new Set([200]);
  const ok = options.allowNonServerError ? response.status < 500 : expected.has(response.status);
  assertGate(ok, "Runtime URL probe failed", { url, status: response.status, durationMs, expectedStatuses: [...expected] });
  return { url, status: response.status, durationMs, bytes: body.byteLength };
}

async function probeUrlWithRetry(target: string, attempts: string | number | undefined, delay: string | number | undefined, options: ProbeOptions = {}): Promise<(ProbeResult & { attempts: number; failures: unknown[] }) | undefined> {
  const cappedAttempts = boundedInteger({ fallback: 1, label: "probe attempts", max: 30, value: attempts });
  const cappedDelay = boundedInteger({ fallback: 0, label: "probe delay", max: 30_000, min: 0, value: delay });
  const failures: { attempt: number; message: string; details: Record<string, unknown> }[] = [];
  for (let attempt = 1; attempt <= cappedAttempts; attempt += 1) {
    try {
      const result = await probeUrl(target, options);
      return { ...result, attempts: attempt, failures };
    } catch (error) {
      const context = errorContext(error);
      failures.push({ attempt, ...context });
      if (attempt === cappedAttempts) {
        assertGate(false, "Runtime URL probe failed after retries", {
          url: target,
          attempts: cappedAttempts,
          delayMs: cappedDelay,
          lastError: context,
          failures,
        });
      }
      if (cappedDelay > 0) await sleep(cappedDelay);
    }
  }
}

async function runGate(name: string, check: () => GateEvidence | Promise<GateEvidence>): Promise<void> {
  if (selectedGates.size && !selectedGates.has(name)) return;
  const started = performance.now();
  try {
    const evidence = await check();
    const status = evidence.status === "failed" ? "failed" : evidence.status === "skipped" ? "skipped" : "ok";
    const message = typeof evidence.reason === "string" ? evidence.reason : "World-class gate required in CI was not configured";
    results.push({
      name,
      status,
      durationMs: Math.round(performance.now() - started),
      evidence,
      ...(status === "failed" ? { message } : {}),
    });
  } catch (error) {
    results.push({ name, status: "failed", durationMs: Math.round(performance.now() - started), message: error instanceof Error ? error.message : String(error), details: gateDetails(error) });
  }
}

async function realUserJourneyE2e() {
  requireScripts(["test:e2e"]);
  const spec = readText("apps/e2e/fullstack/src/fullstack.spec.ts");
  const signals = ["register", "profile", "admin", "frontend"];
  const present = signals.filter((signal) => spec.toLowerCase().includes(signal));
  assertGate(present.length === signals.length, "Fullstack e2e must cover registration, profile, admin, and frontend journeys", { present, signals });
  const command = configuredCommand(["QA_USER_JOURNEY_COMMAND", "USER_JOURNEY_COMMAND"]);
  if (!command) {
    return missingAuthoritativeCommand(
      "Real-user-journey evidence requires QA_USER_JOURNEY_COMMAND to execute the behavior flow; URL reachability is only canary evidence.",
      { env: ["QA_USER_JOURNEY_COMMAND"] },
    );
  }
  return {
    mode: "authoritative-command",
    source: command.source,
    spec: "apps/e2e/fullstack/src/fullstack.spec.ts",
    present,
    ...runCommand("real user journey", command),
  };
}

async function loadStressSoak() {
  requireScripts(["test:perf"]);
  const command = configuredCommand(["QA_LOAD_COMMAND", "LOAD_TEST_COMMAND"]);
  if (command) return { mode: "command", source: command.source, ...runCommand("load/stress/soak", command) };

  const urls = urlsFrom("QA_LOAD_URLS", "QA_LOAD_URL", "PERF_API_URLS", "PERF_URLS");
  if (!urls.length) {
    return missingRuntimeGate("Load/stress/soak gate requires a runtime target in CI; set a command/URL env or WORLD_CLASS_ALLOW_CI_SKIPS=1 for an explicit partial run.", {
      env: ["QA_LOAD_COMMAND", "QA_LOAD_URLS", "QA_LOAD_URL", "PERF_API_URLS", "PERF_URLS"],
    });
  }
  const requestsPerUrl = boundedInteger({ fallback: 20, label: "QA_LOAD_REQUESTS", max: 200, value: process.env.QA_LOAD_REQUESTS });
  const budgetMs = boundedInteger({ fallback: 1000, label: "QA_LOAD_P95_BUDGET_MS", max: 120_000, value: process.env.QA_LOAD_P95_BUDGET_MS });
  const samples: ProbeResult[] = [];
  for (const url of urls) {
    for (let index = 0; index < requestsPerUrl; index += 1) {
      samples.push(await probeUrl(url, { allowNonServerError: true }));
    }
  }
  const p95 = percentile(samples.map((sample) => sample.durationMs), 0.95);
  assertGate(p95 <= budgetMs, "Load/stress/soak p95 exceeded budget", { p95, budgetMs, urls });
  return { mode: "url-probe", urls, requests: samples.length, p95, budgetMs };
}

async function chaosResilience() {
  const urls = urlsFrom("QA_CHAOS_URLS", "QA_CHAOS_URL", "QA_CANARY_URLS", "CANARY_URLS");
  if (!urls.length) {
    return missingRuntimeGate("Chaos gate requires a runtime target in CI; set a command/URL env or WORLD_CLASS_ALLOW_CI_SKIPS=1 for an explicit partial run.", {
      env: ["QA_CHAOS_URLS", "QA_CHAOS_URL", "QA_CANARY_URLS", "CANARY_URLS"],
    });
  }
  const target = urls[0];
  const before = await probeUrl(target, { allowNonServerError: true });
  const chaosService = process.env.QA_CHAOS_SERVICE;
  if (chaosService) {
    assertGate(/^[a-z0-9][a-z0-9_.-]*$/iu.test(chaosService), "QA_CHAOS_SERVICE contains unsupported characters", {
      chaosService,
    });
  }
  const composeCommand =
    existsSync("docker/docker-compose.yml") && chaosService
      ? ["docker", "compose", "-f", "docker/docker-compose.yml", "restart", chaosService]
      : undefined;
  const command = configuredCommand(["QA_CHAOS_COMMAND", "CHAOS_TEST_COMMAND"], composeCommand);
  assertGate(command, "Chaos gate requires QA_CHAOS_COMMAND or an explicit QA_CHAOS_SERVICE", {
    env: ["QA_CHAOS_COMMAND", "QA_CHAOS_SERVICE"],
  });
  const commandEvidence = runCommand("chaos injection", command);
  const after = await probeUrlWithRetry(
    target,
    process.env.QA_CHAOS_PROBE_ATTEMPTS ?? 6,
    process.env.QA_CHAOS_PROBE_DELAY_MS ?? 2000,
    { allowNonServerError: true },
  );
  return { mode: "command-and-probe", commandSource: command.source, before, after, ...commandEvidence };
}

function runBackupRestore() {
  if (backupRestoreEvidence) return backupRestoreEvidence;
  const explicitCommand = configuredCommand(["QA_BACKUP_RESTORE_COMMAND", "BACKUP_RESTORE_COMMAND"]);
  if (explicitCommand) {
    backupRestoreEvidence = { mode: "command", source: explicitCommand.source, ...runCommand("backup/restore", explicitCommand) };
    return backupRestoreEvidence;
  }

  requireScripts(["db:backup", "db:restore"]);
  const missingTools = ["pg_dump", "pg_restore"].filter((tool) => !commandExists(tool));
  const hasDockerFallback = missingTools.length > 0 && dockerAvailable();
  if (missingTools.length && !hasDockerFallback) {
    backupRestoreEvidence = missingRuntimeGate("Backup/restore runtime gate requires local PostgreSQL client tools, the Docker fallback, or an explicit command in CI.", {
      missingTools,
      dockerAvailable: false,
      env: ["QA_BACKUP_RESTORE_COMMAND", "BACKUP_RESTORE_COMMAND"],
    });
    return backupRestoreEvidence;
  }

  const output = join("test-results", "world-class", "backup-restore.dump");
  const backupCommand = configuredCommand([], ["pnpm", "run", "db:backup", "--", "--output", output]);
  const restoreCommand = configuredCommand([], ["pnpm", "run", "db:restore", "--", "--input", output, "--yes"]);
  backupRestoreEvidence = {
    mode: "command-sequence",
    source: backupCommand.source,
    postgresClientMode: hasDockerFallback ? "docker-fallback" : "local",
    backup: runCommand("backup", backupCommand),
    restore: runCommand("restore", restoreCommand),
  };
  return backupRestoreEvidence;
}

function disasterRecovery() {
  const command = configuredCommand(["QA_DR_COMMAND", "DISASTER_RECOVERY_COMMAND"]);
  if (command) return { mode: "command", source: command.source, ...runCommand("disaster recovery", command) };
  return { mode: "backup-restore-runtime", ...runBackupRestore() };
}

function backupRestoreCiGate() {
  const evidence = runBackupRestore();
  const packageJson = readText("package.json");
  const workflows = `${readText(".github/workflows/ci.yml")}\n${readText(".github/workflows/quality-presets.yml")}`;
  assertGate(!/"quality:presets"\s*:\s*"[^"]*--dry-run/.test(packageJson), "quality:presets must not default to dry-run", {});
  assertGate(!/world-class|backup-restore/.test(workflows) || !/--dry-run/.test(workflows), "CI ops gates must not use dry-run", {});
  assertGate(/test:world-class|world-class-gates/.test(workflows), "CI must run world-class gates", {});
  return { ...evidence, workflows: ["ci.yml", "quality-presets.yml"] };
}

function multiTenantSecurity() {
  const command = configuredCommand(
    ["QA_MULTI_TENANT_SECURITY_COMMAND", "MULTI_TENANT_SECURITY_COMMAND"],
    ["pnpm", "exec", "nx", "run", "@app/backend-feature-auth-main:test", "--", "src/application/auth-tenant-isolation.spec.ts", `--maxWorkers=${focusedTestWorkers()}`],
  );
  return { mode: "command", source: command.source, ...runCommand("multi-tenant security", command) };
}

function browserDeviceCloudMatrix() {
  requireScripts(["test:e2e:matrix"]);
  const config = readText("playwright.extended.config.ts");
  const projects = [...crossBrowserProjects];
  const present = projects.filter((project) => config.includes(project));
  assertGate(present.length === projects.length, "Missing browser/device matrix", { present, projects });
  const command = configuredCommand(["QA_BROWSER_MATRIX_COMMAND", "BROWSER_MATRIX_COMMAND"], ["pnpm", "run", "test:e2e:matrix"]);
  return { mode: "command", source: command.source, projects: present, ...runCommand("browser/device matrix", command) };
}

async function canarySyntheticMonitoring() {
  const urls = urlsFrom("QA_CANARY_URLS", "CANARY_URLS", "SYNTHETIC_MONITOR_URLS");
  if (!urls.length) {
    return missingRuntimeGate("Canary/synthetic gate requires runtime targets in CI; set URL env or WORLD_CLASS_ALLOW_CI_SKIPS=1 for an explicit partial run.", {
      env: ["QA_CANARY_URLS", "CANARY_URLS", "SYNTHETIC_MONITOR_URLS"],
    });
  }
  const expectedStatuses = new Set(envList("QA_CANARY_EXPECTED_STATUSES", ["200", "204", "301", "302", "401", "403"]).map(Number));
  const checks: ProbeResult[] = [];
  for (const url of urls) checks.push(await probeUrl(url, { expectedStatuses }));
  const p95 = percentile(checks.map((check) => check.durationMs), 0.95);
  const budgetMs = boundedInteger({ fallback: 1500, label: "QA_CANARY_P95_BUDGET_MS", max: 120_000, value: process.env.QA_CANARY_P95_BUDGET_MS });
  assertGate(p95 <= budgetMs, "Synthetic canary latency SLO exceeded", { p95, budgetMs, urls });
  return { checks: checks.length, p95, budgetMs, statuses: [...expectedStatuses] };
}

function observability() {
  const command = configuredCommand(["QA_OBSERVABILITY_COMMAND", "OBSERVABILITY_COMMAND"]);
  if (!command) {
    return missingAuthoritativeCommand(
      "Observability evidence requires QA_OBSERVABILITY_COMMAND to execute direct telemetry behavior or a runtime observability probe.",
      { env: ["QA_OBSERVABILITY_COMMAND"] },
    );
  }
  return { mode: "authoritative-command", source: command.source, ...runCommand("observability", command) };
}

function migrationRollback() {
  requireScripts(["db:migrations:rollback-check"]);
  const defaultCommand = commandExists("docker") ? ["pnpm", "run", "db:migrations:rollback-check"] : undefined;
  const command = configuredCommand(["QA_MIGRATION_ROLLBACK_COMMAND", "MIGRATION_ROLLBACK_COMMAND"], defaultCommand);
  if (!command) {
    return missingRuntimeGate("Migration rollback gate requires Docker/Testcontainers or an explicit rollback command in CI; set QA_MIGRATION_ROLLBACK_COMMAND or WORLD_CLASS_ALLOW_CI_SKIPS=1 for an explicit partial run.", {
      env: ["QA_MIGRATION_ROLLBACK_COMMAND", "MIGRATION_ROLLBACK_COMMAND"],
      requiredScript: "db:migrations:rollback-check",
    });
  }

  return { mode: "command", source: command.source, ...runCommand("migration rollback", command) };
}

function concurrencyRace() {
  const command = configuredCommand(["QA_CONCURRENCY_COMMAND", "CONCURRENCY_TEST_COMMAND"]);
  if (!command) {
    return missingAuthoritativeCommand(
      "Concurrency evidence requires QA_CONCURRENCY_COMMAND to execute a stateful contested operation; concurrent health probes are only reliability evidence.",
      { env: ["QA_CONCURRENCY_COMMAND"] },
    );
  }
  return { mode: "authoritative-command", source: command.source, ...runCommand("concurrency/race", command) };
}

async function reliabilitySmoke() {
  const command = configuredCommand(["QA_RELIABILITY_COMMAND", "RELIABILITY_SMOKE_COMMAND"]);
  if (command) return { mode: "command", source: command.source, ...runCommand("reliability smoke", command) };

  const urls = urlsFrom("QA_RELIABILITY_URLS", "QA_CANARY_URLS", "CANARY_URLS");
  if (!urls.length) {
    return missingRuntimeGate("Reliability smoke requires an executable command or runtime targets in CI; set QA_RELIABILITY_COMMAND/QA_RELIABILITY_URLS or WORLD_CLASS_ALLOW_CI_SKIPS=1 for an explicit partial run.", {
      env: ["QA_RELIABILITY_COMMAND", "QA_RELIABILITY_URLS", "QA_CANARY_URLS", "CANARY_URLS"],
    });
  }
  const cycles = boundedInteger({ fallback: 5, label: "QA_RELIABILITY_CYCLES", max: 100, value: process.env.QA_RELIABILITY_CYCLES });
  const concurrency = boundedInteger({
    fallback: 4,
    label: "QA_RELIABILITY_CONCURRENCY",
    max: 32,
    value: process.env.QA_RELIABILITY_CONCURRENCY ?? process.env.QA_CONCURRENCY_REQUESTS,
  });
  const probes: ProbeResult[] = [];
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    probes.push(...await Promise.all(
      urls.flatMap((url) => Array.from({ length: concurrency }, () => probeUrl(url))),
    ));
  }
  const p95 = percentile(probes.map((probe) => probe.durationMs), 0.95);
  const budgetMs = boundedInteger({ fallback: 1500, label: "QA_RELIABILITY_P95_BUDGET_MS", max: 120_000, value: process.env.QA_RELIABILITY_P95_BUDGET_MS });
  assertGate(p95 <= budgetMs, "Reliability smoke latency budget exceeded", { p95, budgetMs, cycles, urls });
  return { mode: "bounded-runtime-probe", concurrency, cycles, probes: probes.length, p95, budgetMs, urls };
}

await runGate("real-user-journey-e2e", realUserJourneyE2e);
await runGate("load-stress-soak", loadStressSoak);
await runGate("chaos-resilience", chaosResilience);
await runGate("disaster-recovery", disasterRecovery);
await runGate("backup-restore-ci", backupRestoreCiGate);
await runGate("multi-tenant-security", multiTenantSecurity);
await runGate("browser-device-cloud-matrix", browserDeviceCloudMatrix);
await runGate("canary-synthetic-monitoring", canarySyntheticMonitoring);
await runGate("observability", observability);
await runGate("migration-rollback", migrationRollback);
await runGate("concurrency-race", concurrencyRace);
await runGate("reliability-smoke", reliabilitySmoke);

const skipped = [
  ...results.filter((result) => result.status === "skipped").map((result) => ({ name: result.name, reason: result.evidence?.reason })),
];
const notSelected = worldClassGateNames
  .filter((gate) => selectedGates.size && !selectedGates.has(gate))
  .map((name) => ({ name, reason: "not selected" }));

// A selected gate remains fail-closed in CI. Gates outside a focused run are
// reported separately and do not turn the selected gate into a false failure.
const disallowedSkips = disallowedRequiredSkips({ allowCiSkips, ciMode, selectedGates, skipped });

const failed = [
  ...results.filter((result) => result.status === "failed"),
  ...disallowedSkips.map((entry) => ({
    name: entry.name,
    status: "failed",
    message: `Required gate must not skip in CI without WORLD_CLASS_ALLOW_CI_SKIPS=1: ${entry.reason ?? "skipped"}`,
  })),
];

// Placeholder gates ran against in-repo fixtures/simulations; surface them so they are
// not mistaken for authoritative runtime passes.
const placeholders = results
  .filter((result) => result.evidence?.placeholder === true)
  .map((result) => ({ name: result.name, reason: result.evidence?.placeholderReason }));

const report = {
  status: failed.length ? "failed" : skipped.length ? "partial" : "ok",
  dryRun: false,
  ciMode,
  allowCiSkips,
  gates: results,
  skipped,
  notSelected,
  placeholders,
  generatedAt: new Date().toISOString(),
};
ensureDir("test-results/world-class");
writeJson(reportPath, report);

if (failed.length) {
  console.error("World-class QA gates failed:");
  for (const failure of failed) console.error(`- ${failure.name}: ${failure.message}`);
  process.exit(1);
}

if (skipped.length) {
  console.warn(`World-class QA gates completed with ${skipped.length} skipped gate(s); report status is partial.`);
}
if (placeholders.length) {
  console.warn(`World-class QA gates include ${placeholders.length} placeholder gate(s) that ran against fixtures, not authoritative runtime.`);
}
console.log(JSON.stringify({ status: report.status, gates: results.length, skipped: skipped.length, notSelected: notSelected.length, placeholders: placeholders.length, report: reportPath }));
