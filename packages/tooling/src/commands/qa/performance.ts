#!/usr/bin/env node
import { commandExists, ensureDir, envList, parseArgs, readJson, run, writeJson } from "./runtime-utils.ts";

import { boundedInteger, finiteNumber } from "./world-class-policy.ts";

const args = parseArgs();
const dryRun = args.flags.has("dry-run");
const engine = args.options.get("engine") ?? process.env.PERF_ENGINE ?? "native";
const urls = envList("PERF_URLS");
const apiUrls = envList("PERF_API_URLS");
const reportPath = args.options.get("report") ?? "test-results/performance/report.json";
const lighthouseVersion = args.options.get("lighthouse-version") ?? process.env.LIGHTHOUSE_VERSION ?? "13.3.0";
if (!['native', 'lighthouse'].includes(engine)) throw new Error(`Unknown performance engine: ${engine}`);
const budget = {
  ttfbMs: finiteNumber({fallback: 1500, label: 'PERF_TTFB_BUDGET_MS', max: 120_000, value: process.env.PERF_TTFB_BUDGET_MS}),
  htmlBytes: boundedInteger({fallback: 500000, label: 'PERF_HTML_BUDGET_BYTES', max: 100_000_000, value: process.env.PERF_HTML_BUDGET_BYTES}),
  lighthousePerformance: finiteNumber({fallback: 0.7, label: 'PERF_LIGHTHOUSE_PERFORMANCE_MIN', min: 0, max: 1, value: process.env.PERF_LIGHTHOUSE_PERFORMANCE_MIN}),
  apiP95Ms: finiteNumber({fallback: 750, label: 'PERF_API_P95_BUDGET_MS', max: 120_000, value: process.env.PERF_API_P95_BUDGET_MS}),
};
const count = boundedInteger({fallback: 20, label: 'PERF_API_REQUESTS', max: 200, value: process.env.PERF_API_REQUESTS});
const timeoutMs = boundedInteger({fallback: 10000, label: 'PERF_TIMEOUT_MS', min: 100, max: 120_000, value: process.env.PERF_TIMEOUT_MS});
const results: Record<string, unknown>[] = [];
const findings: Record<string, unknown>[] = [];
ensureDir("test-results/performance");

if (dryRun) {
  writeJson(reportPath, { status: "dry-run", engine, urls, apiUrls, budget, lighthouseVersion });
  console.log(JSON.stringify({ status: "dry-run", preset: "performance", engine, report: reportPath }));
  process.exit(0);
}

if (!urls.length && !apiUrls.length) {
  const status = process.env.PERF_REQUIRE_TARGET === "1" ? "violations" : "skipped";
  writeJson(reportPath, {
    status,
    engine,
    urls,
    apiUrls,
    budget,
    lighthouseVersion,
    reason: "No performance targets configured. Set PERF_URLS and/or PERF_API_URLS to real HTTP(S) targets to enforce budgets.",
  });
  console.log(JSON.stringify({
    status,
    preset: "performance",
    engine,
    reason: "No PERF_URLS or PERF_API_URLS configured",
    report: reportPath,
  }));
  process.exit(status === "violations" ? 1 : 0);
}

if ((engine === "lighthouse" || process.env.PERF_LIGHTHOUSE === "1") && urls.length) {
  if (!commandExists("pnpm")) findings.push({ rule: "lighthouse", severity: "high", message: "pnpm is required to run Lighthouse via pnpm dlx" });
  else {
    for (const [index, url] of urls.entries()) {
      const outputPath = `test-results/performance/lighthouse-${index + 1}.json`;
      const result = run("pnpm", ["dlx", `lighthouse@${lighthouseVersion}`, url, "--quiet", "--chrome-flags=--headless --no-sandbox", "--output=json", `--output-path=${outputPath}`]);
      let score: number | undefined;
      let error: string | undefined;
      try {
        const report = readJson<{categories?: {performance?: {score?: unknown}}; runtimeError?: unknown}>(outputPath);
        const value = report.categories?.performance?.score;
        if (report.runtimeError || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
          throw new Error('Lighthouse report must contain a finite performance score without a runtime error.');
        }
        score = value;
      } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
      const ok = result.status === 0 && score !== undefined && score >= budget.lighthousePerformance;
      results.push({ engine: "lighthouse", url, status: result.status, outputPath, score, minimum: budget.lighthousePerformance, error, ok });
      if (!ok) findings.push({ url, rule: "lighthouse", severity: "high", score, minimum: budget.lighthousePerformance, error, stderr: result.stderr.slice(-2000) });
    }
  }
}

for (const url of urls) {
  try {
    const started = performance.now();
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const ttfbMs = Math.round(performance.now() - started);
    const text = await response.text();
    const htmlBytes = Buffer.byteLength(text);
    const ok = response.ok && ttfbMs <= budget.ttfbMs && htmlBytes <= budget.htmlBytes;
    results.push({ engine: "native-page", url, status: response.status, ttfbMs, htmlBytes, ok });
    if (!ok) findings.push({ url, rule: "page-budget", severity: "high", ttfbMs, htmlBytes, budget });
  } catch (error) {
    findings.push({ url, rule: "page-budget", severity: "high", message: error instanceof Error ? error.message : String(error) });
  }
}

for (const url of apiUrls) {
  const samples: { ms: number; status?: number; ok: boolean; error?: string }[] = [];
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      await response.arrayBuffer();
      samples.push({ ms: Math.round(performance.now() - started), status: response.status, ok: response.ok });
    } catch (error) {
      samples.push({ ms: Math.round(performance.now() - started), ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const sorted = samples.map((sample) => sample.ms).sort((a, b) => a - b);
  const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
  const ok = samples.every((sample) => sample.ok) && p95 <= budget.apiP95Ms;
  results.push({ engine: "native-api", url, requests: samples.length, p95, ok });
  if (!ok) findings.push({ url, rule: "api-load-budget", severity: "high", p95, budget });
}

writeJson(reportPath, { status: findings.length ? "violations" : "ok", engine, budget, lighthouseVersion, results, findings });
if (findings.length) {
  console.error("Performance checks failed:");
  for (const finding of findings) console.error(`- ${finding.url ?? finding.rule}: ${finding.rule}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", engine, pages: urls.length, apiTargets: apiUrls.length, report: reportPath }));
