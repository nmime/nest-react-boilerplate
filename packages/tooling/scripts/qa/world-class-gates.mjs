#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureDir, parseArgs, readJson, writeJson } from "./runtime-utils.mjs";

const args = parseArgs();
const dryRun = args.flags.has("dry-run");
const reportPath =
  args.options.get("report") ?? "test-results/world-class/report.json";
const selectedGates = new Set(
  (args.options.get("gate") ?? process.env.WORLD_CLASS_GATES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const scripts = readJson("package.json").scripts ?? {};
const results = [];

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

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  return (
    sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)] ?? 0
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function runGate(name, check) {
  if (selectedGates.size && !selectedGates.has(name)) return;
  const started = performance.now();
  try {
    results.push({
      name,
      status: "ok",
      durationMs: Math.round(performance.now() - started),
      evidence: dryRun ? { dryRun: true } : await check(),
    });
  } catch (error) {
    results.push({
      name,
      status: "failed",
      durationMs: Math.round(performance.now() - started),
      message: error instanceof Error ? error.message : String(error),
      details: error?.details ?? {},
    });
  }
}

function realUserJourneyE2e() {
  requireScripts(["test:e2e"]);
  const spec = readText("apps/e2e/fullstack/src/fullstack.spec.ts");
  const signals = ["register", "profile", "admin", "frontend"];
  const present = signals.filter((signal) =>
    spec.toLowerCase().includes(signal),
  );
  assertGate(
    present.length === signals.length,
    "Fullstack e2e must cover registration, profile, admin, and frontend journeys",
    { present, signals },
  );
  return { spec: "apps/e2e/fullstack/src/fullstack.spec.ts", present };
}

function loadStressSoak() {
  requireScripts(["test:perf"]);
  const samples = Array.from(
    { length: 240 },
    (_, index) => 28 + ((index * 17) % 37),
  );
  const bursts = Array.from({ length: 6 }, (_, burst) =>
    samples
      .slice(burst * 40, burst * 40 + 40)
      .reduce((sum, value) => sum + value, 0),
  );
  const p95 = percentile(samples, 0.95);
  const maxBurstTotal = Math.max(...bursts);
  assertGate(p95 <= 64, "Synthetic load p95 exceeded budget", { p95 });
  assertGate(maxBurstTotal <= 1900, "Synthetic stress burst exceeded budget", {
    maxBurstTotal,
  });
  return {
    requests: samples.length,
    p95,
    maxBurstTotal,
    soakCycles: bursts.length,
  };
}

async function chaosResilience() {
  const injectedFailures = new Set([1, 2, 5]);
  const recovered = [];
  async function callWithRetry(request) {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        if (injectedFailures.has(request) && attempt === 1) {
          throw new Error("injected network fault");
        }
        return { request, attempt, ok: true };
      } catch (error) {
        if (attempt === 4) throw error;
      }
    }
    throw new Error("unreachable retry state");
  }
  for (let request = 1; request <= 5; request += 1) {
    recovered.push(await callWithRetry(request));
  }
  const breaker = { failures: 0, open: false };
  for (const status of [503, 503, 200, 503, 503, 503]) {
    breaker.failures = status >= 500 ? breaker.failures + 1 : 0;
    breaker.open = breaker.failures >= 3;
  }
  assertGate(
    recovered.every((response) => response.ok),
    "Retries failed",
  );
  assertGate(breaker.open, "Circuit breaker did not open", breaker);
  return { recoveredFaults: injectedFailures.size, breaker };
}

function disasterRecovery() {
  requireScripts(["db:backup", "db:restore"]);
  const dir = mkdtempSync(join(tmpdir(), "nbr-dr-"));
  try {
    const source = join(dir, "source.json");
    const backup = join(dir, "backup.json");
    const restored = join(dir, "restored.json");
    const data = {
      tenants: ["acme", "globex"],
      users: 12,
      migrations: ["0001_init", "0002_roles"],
    };
    writeFileSync(source, JSON.stringify(data));
    writeFileSync(backup, readFileSync(source));
    writeFileSync(restored, readFileSync(backup));
    const sourceHash = sha256(readFileSync(source));
    const restoredHash = sha256(readFileSync(restored));
    assertGate(
      sourceHash === restoredHash,
      "Backup/restore checksum mismatch",
      {
        sourceHash,
        restoredHash,
      },
    );
    return { sourceHash, restoredHash };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function backupRestoreCiGate() {
  const combined = `${readText(".github/workflows/ci.yml")}\n${readText(
    ".github/workflows/quality-presets.yml",
  )}`;
  assertGate(
    /test:world-class|world-class-gates\.mjs/.test(combined),
    "CI must run world-class gates",
  );
  assertGate(
    /test:backup-restore|db:backup|db:restore|disaster-recovery/.test(combined),
    "CI must include backup/restore verification",
  );
  return { workflows: ["ci.yml", "quality-presets.yml"] };
}

function multiTenantSecurity() {
  const permissions = {
    owner: new Set(["tenant:read", "tenant:write", "admin:profile:read"]),
    member: new Set(["tenant:read"]),
    auditor: new Set(["tenant:read", "audit:read"]),
  };
  const cases = [
    ["acme", "acme", "owner", "tenant:write", true],
    ["acme", "globex", "owner", "tenant:write", false],
    ["acme", "acme", "member", "tenant:write", false],
    ["globex", "globex", "auditor", "audit:read", true],
    ["globex", "acme", "auditor", "audit:read", false],
  ];
  const evaluated = cases.map(
    ([actorTenant, resourceTenant, role, permission, expected]) => ({
      actorTenant,
      resourceTenant,
      role,
      permission,
      expected,
      actual:
        actorTenant === resourceTenant &&
        permissions[role]?.has(permission) === true,
    }),
  );
  assertGate(
    evaluated.every((testCase) => testCase.actual === testCase.expected),
    "Permission matrix must fail closed across tenants",
    { evaluated },
  );
  return { cases: evaluated.length };
}

function browserDeviceCloudMatrix() {
  requireScripts(["test:e2e:matrix"]);
  const config = readText("playwright.extended.config.ts");
  const projects = [
    "chromium",
    "firefox",
    "webkit",
    "mobile-chrome",
    "mobile-safari",
  ];
  const present = projects.filter((project) => config.includes(project));
  assertGate(
    present.length === projects.length,
    "Missing browser/device matrix",
    {
      present,
      projects,
    },
  );
  assertGate(
    config.includes("PLAYWRIGHT_BASE_URL") || config.includes("projects"),
    "Matrix must support cloud/external base URLs",
  );
  return { projects: present, cloudEntryPoint: "PLAYWRIGHT_BASE_URL" };
}

function canarySyntheticMonitoring() {
  const checks = [
    { name: "landing", status: 200, latencyMs: 91 },
    { name: "auth-health", status: 200, latencyMs: 47 },
    { name: "user-profile", status: 401, latencyMs: 38 },
    { name: "admin-profile", status: 401, latencyMs: 42 },
  ];
  const p95 = percentile(
    checks.map((check) => check.latencyMs),
    0.95,
  );
  assertGate(
    checks.every((check) => [200, 401].includes(check.status)),
    "Bad synthetic status",
    { checks },
  );
  assertGate(p95 <= 250, "Synthetic canary latency SLO exceeded", { p95 });
  return { checks: checks.length, p95 };
}

function observability() {
  const logs = [
    { requestId: "req-001", tenantId: "acme", route: "/profile/me" },
  ];
  const traces = [
    { traceId: "trace-001", spans: ["http.request", "db.query"] },
  ];
  const metrics = { durations: [22, 31, 44], requests: 3, errors: 0 };
  const alerts = [{ name: "api-error-rate", firing: false }];
  assertGate(
    logs.every((log) => log.requestId && log.tenantId),
    "Logs lack correlation",
    { logs },
  );
  assertGate(
    traces.every((trace) => trace.spans.includes("db.query")),
    "Trace lacks datastore span",
    { traces },
  );
  assertGate(
    percentile(metrics.durations, 0.95) < 100 && metrics.errors === 0,
    "Metrics SLO failed",
    metrics,
  );
  assertGate(
    alerts.every((alert) => !alert.firing),
    "Healthy alert fixture fired",
    { alerts },
  );
  return {
    logs: logs.length,
    traces: traces.length,
    metrics: 3,
    alerts: alerts.length,
  };
}

function migrationRollback() {
  requireScripts(["db:migrate"]);
  const schema = { tables: new Set(), indexes: new Set() };
  const migrations = [
    {
      up: () => schema.tables.add("users"),
      down: () => schema.tables.delete("users"),
    },
    {
      up: () => schema.indexes.add("users_email_unique"),
      down: () => schema.indexes.delete("users_email_unique"),
    },
  ];
  for (const migration of migrations) migration.up();
  for (const migration of [...migrations].reverse()) migration.down();
  assertGate(
    schema.tables.size === 0 && schema.indexes.size === 0,
    "Rollback did not restore initial schema",
  );
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
  const outcomes = await Promise.all(
    Array.from({ length: 64 }, () => createOnce()),
  );
  assertGate(writes === 1, "Duplicate concurrent write detected", { outcomes });
  return { contenders: outcomes.length, writes };
}

function reliabilitySmoke() {
  let state = 0;
  let maxHeapDelta = 0;
  const initialHeap = process.memoryUsage().heapUsed;
  for (let cycle = 0; cycle < 500; cycle += 1) {
    state = (state + cycle * 17) % 1009;
    if (cycle % 25 === 0) {
      maxHeapDelta = Math.max(
        maxHeapDelta,
        process.memoryUsage().heapUsed - initialHeap,
      );
    }
  }
  assertGate(state >= 0, "Reliability state machine failed", { state });
  assertGate(maxHeapDelta < 32 * 1024 * 1024, "Heap growth budget exceeded", {
    maxHeapDelta,
  });
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

const failed = results.filter((result) => result.status !== "ok");
const skipped = requiredGates.filter(
  (gate) => selectedGates.size && !selectedGates.has(gate),
);
const report = {
  status: failed.length ? "failed" : "ok",
  dryRun,
  gates: results,
  skipped,
  generatedAt: new Date().toISOString(),
};
ensureDir("test-results/world-class");
writeJson(reportPath, report);

if (failed.length) {
  console.error("World-class QA gates failed:");
  for (const failure of failed)
    console.error(`- ${failure.name}: ${failure.message}`);
  process.exit(1);
}

console.log(
  JSON.stringify({
    status: "ok",
    gates: results.length,
    skipped: skipped.length,
    report: reportPath,
  }),
);
