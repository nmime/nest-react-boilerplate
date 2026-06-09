#!/usr/bin/env node
// @ts-nocheck
import { commandExists, envList, parseArgs, run, writeJson } from "./runtime-utils.ts";

const args = parseArgs();
const dryRun = args.flags.has("dry-run");
const engine = args.options.get("engine") ?? process.env.SECURITY_DAST_ENGINE ?? "native";
const urls = envList("SECURITY_DAST_URLS");
const reportPath = args.options.get("report") ?? "test-results/security-dast/report.json";
const requiredHeaders = (process.env.SECURITY_DAST_REQUIRED_HEADERS ?? "x-content-type-options,referrer-policy").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
const findings = [];
const results = [];

if (dryRun || !urls.length) {
  writeJson(reportPath, { status: "dry-run", engine, urls, requiredHeaders });
  console.log(JSON.stringify({ status: "dry-run", preset: "security-dast", engine, urls, report: reportPath }));
  process.exit(0);
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
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(Number(process.env.SECURITY_DAST_TIMEOUT_MS ?? 10000)) });
    const missingHeaders = requiredHeaders.filter((header) => !response.headers.has(header));
    const body = await response.text();
    const reflectedPayload = "<script>qa-dast</script>";
    const probeUrl = new URL(url);
    probeUrl.searchParams.set("qa_dast", reflectedPayload);
    const probe = await fetch(probeUrl, { signal: AbortSignal.timeout(Number(process.env.SECURITY_DAST_TIMEOUT_MS ?? 10000)) });
    const probeText = await probe.text();
    const exposedPaths = [];
    for (const path of ["/.env", "/.git/config", "/server-status", "/actuator/env"]) {
      const target = new URL(path, url);
      const exposure = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(Number(process.env.SECURITY_DAST_TIMEOUT_MS ?? 10000)) }).catch((error) => ({ error }));
      if (!("error" in exposure) && exposure.status === 200) exposedPaths.push(path);
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
