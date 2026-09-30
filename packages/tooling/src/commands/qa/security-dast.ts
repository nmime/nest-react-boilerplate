#!/usr/bin/env node
import { commandExists, envList, parseArgs, run, writeJson } from "./runtime-utils.ts";
import { boundedInteger } from './world-class-policy.ts';

const args = parseArgs();
const dryRun = args.flags.has("dry-run");
const engine = args.options.get("engine") ?? process.env.SECURITY_DAST_ENGINE ?? "native";
const urls = envList("SECURITY_DAST_URLS");
const reportPath = args.options.get("report") ?? "test-results/security-dast/report.json";
const requiredHeaders = (process.env.SECURITY_DAST_REQUIRED_HEADERS ?? "x-content-type-options,referrer-policy").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
const findings: Record<string, unknown>[] = [];
const results: Record<string, unknown>[] = [];
if (!['native', 'zap'].includes(engine)) throw new Error(`Unknown DAST engine: ${engine}`);
const timeoutMs = boundedInteger({ fallback: 10000, label: 'SECURITY_DAST_TIMEOUT_MS', min: 100, max: 120_000, value: process.env.SECURITY_DAST_TIMEOUT_MS });

if (dryRun) {
  writeJson(reportPath, { status: "dry-run", engine, urls, requiredHeaders });
  console.log(JSON.stringify({ status: "dry-run", preset: "security-dast", engine, urls, report: reportPath }));
  process.exit(0);
}

if (!urls.length) {
  const status = process.env.SECURITY_DAST_REQUIRE_TARGET === '1' ? 'violations' : 'skipped';
  writeJson(reportPath, { status, engine, urls, requiredHeaders, reason: 'No SECURITY_DAST_URLS configured.' });
  console.log(JSON.stringify({ status, engine, report: reportPath }));
  process.exit(status === 'violations' ? 1 : 0);
}

function sensitiveContent(path: string, contentType: string, text: string): boolean {
  if (path === '/.env') return !contentType.includes('html') && [...text.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*\S+/gmu)]
    .some((match) => /PASSWORD|SECRET|TOKEN|KEY|DATABASE_URL/u.test(match[1] ?? ''));
  if (path === '/.git/config') return /^\s*\[(?:core|remote\s+"[^"]+"|branch\s+"[^"]+")\]\s*$/mu.test(text);
  if (path === '/server-status') return /Apache Server Status|ServerVersion:\s*Apache|Total Accesses:\s*\d+/iu.test(text);
  if (path === '/actuator/env') {
    try { const value: unknown = JSON.parse(text); return value !== null && typeof value === 'object' && 'propertySources' in value && Array.isArray(value.propertySources); }
    catch { return false; }
  }
  return false;
}

if (engine === "zap") {
  if (commandExists("docker")) {
    for (const url of urls) {
      const result = run("docker", ["run", "--rm", "-t", "ghcr.io/zaproxy/zaproxy:stable", "zap-baseline.py", "-t", url]);
      results.push({ engine: "zap-docker", url, status: result.status, ok: result.status === 0, stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-4000) });
      if (result.status !== 0) findings.push({ url, rule: "zap-baseline", severity: "high", message: "OWASP ZAP baseline reported alerts" });
    }
  } else findings.push({ rule: "zap", severity: "high", message: "SECURITY_DAST_ENGINE=zap requested but Docker is unavailable" });
}

for (const url of urls) {
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    const missingHeaders = requiredHeaders.filter((header) => !response.headers.has(header));
    const body = await response.text();
    const reflectedPayload = "<script>qa-dast</script>";
    const probeUrl = new URL(url);
    probeUrl.searchParams.set("qa_dast", reflectedPayload);
    const probe = await fetch(probeUrl, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    const probeText = await probe.text();
    const exposedPaths = [];
    for (const path of ["/.env", "/.git/config", "/server-status", "/actuator/env"]) {
      const target = new URL(path, url);
      const exposure = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      const text = await exposure.text();
      if (exposure.ok && sensitiveContent(path, exposure.headers.get('content-type') ?? '', text)) exposedPaths.push(path);
    }
    const ok = response.status < 500 && probe.status < 500 && missingHeaders.length === 0 && !probeText.includes(reflectedPayload) && exposedPaths.length === 0;
    results.push({ engine: "native", url, status: response.status, bytes: Buffer.byteLength(body), missingHeaders, probeStatus: probe.status, reflectedPayload: probeText.includes(reflectedPayload), exposedPaths, ok });
    if (!ok) findings.push({ url, rule: "native-dast", severity: "high", missingHeaders, reflectedPayload: probeText.includes(reflectedPayload), exposedPaths });
  } catch (error) {
    findings.push({ url, rule: "native-dast", severity: "high", message: error instanceof Error ? error.message : String(error) });
  }
}

writeJson(reportPath, { status: findings.length ? "violations" : "ok", engine, requiredHeaders, results, findings });
if (findings.length) {
  console.error("Security DAST failed:");
  for (const finding of findings) console.error(`- ${finding.url ?? finding.rule}: ${finding.rule}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", engine, urls: urls.length, report: reportPath }));
