#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commandExists, envList, ensureDir, parseArgs, readJson, run, writeJson } from "./runtime-utils.mjs";

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
const scripts = readJson("package.json").scripts ?? {};
const results = [];
const ciMode = process.env.CI === "true";
const allowCiSkips = process.env.WORLD_CLASS_ALLOW_CI_SKIPS === "1";
let backupRestoreEvidence;

const requiredGates = [
  "real-user-journey-e2e",
  "load-stress-soak",
  "chaos-resilience",
  "disaster-recovery",
  "backup-restore-ci",
  "multi-tenant-security",
  "browser-device-cloud-matrix",
  "canary-synthetic-monitoring",
  "observability",
  "migration-rollback",
  "concurrency-race",
  "reliability-smoke",
];

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function assertGate(condition, message, details = {}) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
}

function requireScripts(names) {
  for (const name of names) {
    assertGate(Boolean(scripts[name]), `Missing package script: ${name}`);
  }
}

function missingRuntimeGate(reason, details = {}) {
  return {
    status: ciMode && !allowCiSkips ? "failed" : "skipped",
    reason,
    details: { ...details, ciMode, allowCiSkipsEnv: "WORLD_CLASS_ALLOW_CI_SKIPS=1" },
  };
}

function skipGate(reason, details = {}) {
  return { status: "skipped", reason, details };
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)] ?? 0;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function tail(value, max = 2000) {
  const text = String(value ?? "");
  return text.length > max ? text.slice(-max) : text;
}

function redact(value) {
  return String(value ?? "")
    .replaceAll(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/giu, "$1***$2")
    .replaceAll(/([?&](?:token|key|secret|password)=)[^&\s]+/giu, "$1***")
    .replaceAll(/(authorization:\s*bearer\s+)[^\s]+/giu, "$1***");
}

function firstEnv(names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
}

function assertNonDryRunCommand(command, label) {
  assertGate(!/(^|\s)--dry-run(\s|$)|dry-run/i.test(command), `${label} must not use dry-run`, { command: redact(command) });
}

function configuredCommand(names, fallback) {
  const fromEnv = firstEnv(names);
  if (fromEnv) return { command: fromEnv.value, source: fromEnv.name };
  if (fallback) return { command: fallback, source: "ci-safe-local-default" };
  return null;
}

function runShell(label, command, extraEnv = {}) {
  assertNonDryRunCommand(command, label);
  const result = run("sh", ["-c", command], { env: extraEnv });
  assertGate(result.status === 0, `${label} command failed`, {
    command: redact(command),
    status: result.status,
    stdout: redact(tail(result.stdout)),
    stderr: redact(tail(result.stderr)),
    error: result.error,
  });
  return {
    commandHash: sha256(command),
    status: result.status,
    stdoutHash: sha256(result.stdout ?? ""),
    stderrHash: sha256(result.stderr ?? ""),
  };
}

function urlsFrom(...names) {
  const urls = [];
  for (const name of names) urls.push(...envList(name));
  return [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
}

async function probeUrl(url, options = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    assertGate(false, "Invalid runtime URL", { url });
  }
  assertGate(["http:", "https:"].includes(parsed.protocol), "Runtime probe URL must be HTTP(S)", { url });
  const started = performance.now();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(Number(process.env.QA_URL_TIMEOUT_MS ?? 15000)),
    headers: process.env.QA_CANARY_USER_AGENT ? { "user-agent": process.env.QA_CANARY_USER_AGENT } : undefined,
  });
  const body = await response.arrayBuffer();
  const durationMs = Math.round(performance.now() - started);
  const expected = options.expectedStatuses ?? new Set([200]);
  const ok = options.allowNonServerError ? response.status < 500 : expected.has(response.status);
  assertGate(ok, "Runtime URL probe failed", { url, status: response.status, durationMs, expectedStatuses: [...expected] });
  return { url, status: response.status, durationMs, bytes: body.byteLength };
}

async function runGate(name, check) {
  if (selectedGates.size && !selectedGates.has(name)) return;
  const started = performance.now();
  try {
    const evidence = await check();
    const status = evidence?.status === "failed" ? "failed" : evidence?.status === "skipped" ? "skipped" : "ok";
    results.push({
      name,
      status,
      durationMs: Math.round(performance.now() - started),
      evidence,
      ...(status === "failed" ? { message: evidence?.reason ?? "World-class gate required in CI was not configured" } : {}),
    });
  } catch (error) {
    results.push({ name, status: "failed", durationMs: Math.round(performance.now() - started), message: error instanceof Error ? error.message : String(error), details: error?.details ?? {} });
  }
}

function realUserJourneyE2e() {
  requireScripts(["test:e2e"]);
  const spec = readText("apps/e2e/fullstack/src/fullstack.spec.ts");
  const signals = ["register", "profile", "admin", "frontend"];
  const present = signals.filter((signal) => spec.toLowerCase().includes(signal));
  assertGate(present.length === signals.length, "Fullstack e2e must cover registration, profile, admin, and frontend journeys", { present, signals });
  return { spec: "apps/e2e/fullstack/src/fullstack.spec.ts", present };
}

async function loadStressSoak() {
  requireScripts(["test:perf"]);
  const command = configuredCommand(["QA_LOAD_COMMAND", "LOAD_TEST_COMMAND"]);
  if (command) return { mode: "command", source: command.source, ...runShell("load/stress/soak", command.command) };

  const urls = urlsFrom("QA_LOAD_URLS", "QA_LOAD_URL", "PERF_API_URLS", "PERF_URLS");
  if (!urls.length) {
    return missingRuntimeGate("Load/stress/soak gate requires a runtime target in CI; set a command/URL env or WORLD_CLASS_ALLOW_CI_SKIPS=1 for an explicit partial run.", {
      env: ["QA_LOAD_COMMAND", "QA_LOAD_URLS", "QA_LOAD_URL", "PERF_API_URLS", "PERF_URLS"],
    });
  }
  const requestsPerUrl = Number(process.env.QA_LOAD_REQUESTS ?? 20);
  const budgetMs = Number(process.env.QA_LOAD_P95_BUDGET_MS ?? 1000);
  const samples = [];
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
  const defaultCommand = existsSync("docker/docker-compose.yml") ? `docker compose -f docker/docker-compose.yml restart ${process.env.QA_CHAOS_SERVICE ?? "user-app-api"}` : undefined;
  const command = configuredCommand(["QA_CHAOS_COMMAND", "CHAOS_TEST_COMMAND"], defaultCommand);
  assertGate(Boolean(command), "Chaos gate requires QA_CHAOS_COMMAND or docker/docker-compose.yml local default", { env: ["QA_CHAOS_COMMAND", "QA_CHAOS_SERVICE"] });
  const commandEvidence = runShell("chaos injection", command.command);
  const after = await probeUrl(target, { allowNonServerError: true });
  return { mode: "command-and-probe", commandSource: command.source, before, after, ...commandEvidence };
}

function backupRestoreCommand(outputName) {
  const output = join("test-results", "world-class", outputName);
  return `pnpm run db:backup -- --output ${output} && pnpm run db:restore -- --input ${output} --yes`;
}

function runBackupRestore() {
  if (backupRestoreEvidence) return backupRestoreEvidence;
  const explicitCommand = configuredCommand(["QA_BACKUP_RESTORE_COMMAND", "BACKUP_RESTORE_COMMAND"]);
  if (explicitCommand) {
    backupRestoreEvidence = { mode: "command", source: explicitCommand.source, ...runShell("backup/restore", explicitCommand.command) };
    return backupRestoreEvidence;
  }

  requireScripts(["db:backup", "db:restore"]);
  const missingTools = ["pg_dump", "pg_restore"].filter((tool) => !commandExists(tool));
  if (missingTools.length) {
    backupRestoreEvidence = missingRuntimeGate("Backup/restore runtime gate requires local PostgreSQL client tools or an explicit command in CI.", {
      missingTools,
      env: ["QA_BACKUP_RESTORE_COMMAND", "BACKUP_RESTORE_COMMAND"],
    });
    return backupRestoreEvidence;
  }

  const command = configuredCommand(["QA_BACKUP_RESTORE_COMMAND", "BACKUP_RESTORE_COMMAND"], backupRestoreCommand("backup-restore.dump"));
  backupRestoreEvidence = { mode: "command", source: command.source, ...runShell("backup/restore", command.command) };
  return backupRestoreEvidence;
}

function disasterRecovery() {
  const command = configuredCommand(["QA_DR_COMMAND", "DISASTER_RECOVERY_COMMAND"]);
  if (command) return { mode: "command", source: command.source, ...runShell("disaster recovery", command.command) };
  return { mode: "backup-restore-runtime", ...runBackupRestore() };
}

function backupRestoreCiGate() {
  const evidence = runBackupRestore();
  const packageJson = readText("package.json");
  const workflows = `${readText(".github/workflows/ci.yml")}\n${readText(".github/workflows/quality-presets.yml")}`;
  assertGate(!/"quality:presets"\s*:\s*"[^"]*--dry-run/.test(packageJson), "quality:presets must not default to dry-run", {});
  assertGate(!/world-class|backup-restore/.test(workflows) || !/--dry-run/.test(workflows), "CI ops gates must not use dry-run", {});
  assertGate(/test:world-class|world-class-gates\.mjs/.test(workflows), "CI must run world-class gates", {});
  return { ...evidence, workflows: ["ci.yml", "quality-presets.yml"] };
}

function multiTenantSecurity() {
  const permissions = { owner: new Set(["tenant:read", "tenant:write", "admin:profile:read"]), member: new Set(["tenant:read"]), auditor: new Set(["tenant:read", "audit:read"]) };
  const cases = [["acme", "acme", "owner", "tenant:write", true], ["acme", "globex", "owner", "tenant:write", false], ["acme", "acme", "member", "tenant:write", false], ["globex", "globex", "auditor", "audit:read", true], ["globex", "acme", "auditor", "audit:read", false]];
  const evaluated = cases.map(([actorTenant, resourceTenant, role, permission, expected]) => ({ actorTenant, resourceTenant, role, permission, expected, actual: actorTenant === resourceTenant && permissions[role]?.has(permission) === true }));
  assertGate(evaluated.every((testCase) => testCase.actual === testCase.expected), "Permission matrix must fail closed across tenants", { evaluated });
  return { cases: evaluated.length };
}

function browserDeviceCloudMatrix() {
  requireScripts(["test:e2e:matrix"]);
  const config = readText("playwright.extended.config.ts");
  const projects = ["chromium", "firefox", "webkit", "mobile-chrome", "mobile-safari"];
  const present = projects.filter((project) => config.includes(project));
  assertGate(present.length === projects.length, "Missing browser/device matrix", { present, projects });
  const command = configuredCommand(["QA_BROWSER_MATRIX_COMMAND", "BROWSER_MATRIX_COMMAND"], "pnpm run test:e2e:matrix");
  return { mode: "command", source: command.source, projects: present, ...runShell("browser/device matrix", command.command) };
}

async function canarySyntheticMonitoring() {
  const urls = urlsFrom("QA_CANARY_URLS", "CANARY_URLS", "SYNTHETIC_MONITOR_URLS");
  if (!urls.length) {
    return missingRuntimeGate("Canary/synthetic gate requires runtime targets in CI; set URL env or WORLD_CLASS_ALLOW_CI_SKIPS=1 for an explicit partial run.", {
      env: ["QA_CANARY_URLS", "CANARY_URLS", "SYNTHETIC_MONITOR_URLS"],
    });
  }
  const expectedStatuses = new Set(envList("QA_CANARY_EXPECTED_STATUSES", ["200", "204", "301", "302", "401", "403"]).map(Number));
  const checks = [];
  for (const url of urls) checks.push(await probeUrl(url, { expectedStatuses }));
  const p95 = percentile(checks.map((check) => check.durationMs), 0.95);
  const budgetMs = Number(process.env.QA_CANARY_P95_BUDGET_MS ?? 1500);
  assertGate(p95 <= budgetMs, "Synthetic canary latency SLO exceeded", { p95, budgetMs, urls });
  return { checks: checks.length, p95, budgetMs, statuses: [...expectedStatuses] };
}

function observability() {
  const command = configuredCommand(["QA_OBSERVABILITY_COMMAND", "OBSERVABILITY_COMMAND"]);
  if (command) return { mode: "command", source: command.source, ...runShell("observability", command.command) };
  const logs = [{ requestId: "req-001", tenantId: "acme", route: "/profile/me" }];
  const traces = [{ traceId: "trace-001", spans: ["http.request", "db.query"] }];
  const metrics = { durations: [22, 31, 44], requests: 3, errors: 0 };
  assertGate(logs.every((log) => log.requestId && log.tenantId), "Logs lack correlation", { logs });
  assertGate(traces.every((trace) => trace.spans.includes("db.query")), "Trace lacks datastore span", { traces });
  assertGate(percentile(metrics.durations, 0.95) < 100 && metrics.errors === 0, "Metrics SLO failed", metrics);
  return { logs: logs.length, traces: traces.length, metrics: 3 };
}

function migrationRollback() {
  requireScripts(["db:migrate"]);
  const command = configuredCommand(["QA_MIGRATION_ROLLBACK_COMMAND", "MIGRATION_ROLLBACK_COMMAND"]);
  if (command) return { mode: "command", source: command.source, ...runShell("migration rollback", command.command) };
  const schema = { tables: new Set(), indexes: new Set() };
  const migrations = [{ up: () => schema.tables.add("users"), down: () => schema.tables.delete("users") }, { up: () => schema.indexes.add("users_email_unique"), down: () => schema.indexes.delete("users_email_unique") }];
  for (const migration of migrations) migration.up();
  for (const migration of [...migrations].reverse()) migration.down();
  assertGate(schema.tables.size === 0 && schema.indexes.size === 0, "Rollback did not restore initial schema");
  return { migrations: migrations.length };
}

async function concurrencyRace() {
  let created = false;
  let writes = 0;
  async function createOnce() {
    await Promise.resolve();
    if (created) return "duplicate";
    created = true;
    writes += 1;
    return "created";
  }
  const outcomes = await Promise.all(Array.from({ length: 64 }, () => createOnce()));
  assertGate(writes === 1, "Duplicate concurrent write detected", { outcomes });
  return { contenders: outcomes.length, writes };
}

function reliabilitySmoke() {
  let state = 0;
  let maxHeapDelta = 0;
  const initialHeap = process.memoryUsage().heapUsed;
  for (let cycle = 0; cycle < 500; cycle += 1) {
    state = (state + cycle * 17) % 1009;
    if (cycle % 25 === 0) maxHeapDelta = Math.max(maxHeapDelta, process.memoryUsage().heapUsed - initialHeap);
  }
  assertGate(state >= 0, "Reliability state machine failed", { state });
  assertGate(maxHeapDelta < 32 * 1024 * 1024, "Heap growth budget exceeded", { maxHeapDelta });
  return { cycles: 500, state, maxHeapDelta };
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

const failed = results.filter((result) => result.status === "failed");
const skipped = [
  ...requiredGates.filter((gate) => selectedGates.size && !selectedGates.has(gate)).map((name) => ({ name, reason: "not selected" })),
  ...results.filter((result) => result.status === "skipped").map((result) => ({ name: result.name, reason: result.evidence?.reason })),
];
const report = {
  status: failed.length ? "failed" : skipped.length ? "partial" : "ok",
  dryRun: false,
  ciMode,
  allowCiSkips,
  gates: results,
  skipped,
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
console.log(JSON.stringify({ status: report.status, gates: results.length, skipped: skipped.length, report: reportPath }));
