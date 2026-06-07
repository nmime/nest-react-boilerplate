#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { collectFiles, commandExists, parseArgs, run, textFileFilter, workspaceRoot, writeJson } from "./runtime-utils.mjs";

const args = parseArgs();
const dryRun = args.flags.has("dry-run");
const engine = args.options.get("engine") ?? process.env.SECRET_SCAN_ENGINE ?? "native";
const failOnUnavailableExternal = (process.env.SECRET_SCAN_FAIL_ON_UNAVAILABLE_EXTERNAL ?? "true") !== "false";
const requestedExternalEngine = engine === "gitleaks";
const reportPath = args.options.get("report") ?? "test-results/security-secrets/report.json";
const gitleaksImage = args.options.get("gitleaks-image") ?? process.env.GITLEAKS_DOCKER_IMAGE ?? "zricethezav/gitleaks:v8.30.0";
const findings = [];
const patterns = [
  { id: "private-key", severity: "critical", regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
  { id: "aws-access-key", severity: "critical", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: "github-token", severity: "critical", regex: /\b(?:gh[pousr]_[A-Za-z0-9_]{36,}|github_pat_[A-Za-z0-9_]{80,})\b/g },
  { id: "slack-token", severity: "critical", regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { id: "generic-secret-assignment", severity: "high", regex: /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']([A-Za-z0-9_./+=-]{24,})["']/gi },
  { id: "jwt-like-token", severity: "high", regex: /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g },
  { id: "database-url-credential", severity: "high", regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@]+:([^\s@]{12,})@/gi },
];

function entropy(value) {
  const counts = new Map();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  return [...counts.values()].reduce((sum, count) => {
    const p = count / value.length;
    return sum - p * Math.log2(p);
  }, 0);
}
function allowed(value, rel = "") {
  if (/example|sample|fixture|test|dummy|changeme|placeholder|process\.env/i.test(value)) return true;
  if (rel.endsWith("env-loader.mjs") && /postgres/i.test(value)) return true;
  return false;
}

if (engine === "gitleaks" && !dryRun) {
  if (commandExists("gitleaks")) {
    const result = run("gitleaks", ["detect", "--source", ".", "--redact", "--no-git", "--report-format", "json", "--report-path", reportPath]);
    if (result.status !== 0) findings.push({ rule: "gitleaks", severity: "critical", message: "gitleaks reported findings", stderr: result.stderr.slice(-2000) });
  } else if (commandExists("docker")) {
    const result = run("docker", ["run", "--rm", "-v", `${process.cwd()}:/repo`, gitleaksImage, "detect", "--source", "/repo", "--redact", "--no-git"]);
    if (result.status !== 0) findings.push({ rule: "gitleaks-docker", severity: "critical", message: "gitleaks reported findings", stderr: result.stderr.slice(-2000) });
  } else if (failOnUnavailableExternal) findings.push({ rule: "gitleaks", severity: "high", message: "SECRET_SCAN_ENGINE=gitleaks requested but gitleaks/Docker is unavailable" });
}

if (engine !== "gitleaks" || findings.length === 0 || requestedExternalEngine) {
  for (const file of collectFiles(workspaceRoot, { include: textFileFilter })) {
    const rel = relative(workspaceRoot, file).replaceAll("\\", "/");
    const text = readFileSync(file, "utf8");
    for (const pattern of patterns) for (const match of text.matchAll(pattern.regex)) {
      const value = match[1] ?? match[0];
      const rawValue = match[0];
      if (allowed(value, rel) || allowed(rawValue, rel)) continue;
      const line = text.slice(0, match.index).split("\n").length;
      findings.push({ file: rel, line, rule: pattern.id, severity: pattern.severity });
    }
    for (const match of text.matchAll(/["']([A-Za-z0-9+/=_-]{40,})["']/g)) {
      const value = match[1];
      if (allowed(value, rel) || entropy(value) < 4.4) continue;
      const line = text.slice(0, match.index).split("\n").length;
      findings.push({ file: rel, line, rule: "high-entropy-string", severity: "medium" });
    }
  }
}

writeJson(reportPath, { status: findings.length ? "failed" : "ok", engine, dryRun, gitleaksImage, failOnUnavailableExternal, findings });
if (dryRun) {
  console.log(JSON.stringify({ status: "dry-run", engine, rules: patterns.map((pattern) => pattern.id), findings: findings.length, report: reportPath }));
  process.exit(0);
}
if (findings.length) {
  console.error("Secret scan failed:");
  for (const finding of findings) console.error(`- ${finding.file ?? finding.rule}${finding.line ? `:${finding.line}` : ""} ${finding.rule} (${finding.severity})`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", engine, report: reportPath }));
