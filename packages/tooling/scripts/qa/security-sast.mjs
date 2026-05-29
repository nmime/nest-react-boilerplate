#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { extname, relative } from "node:path";
import { collectFiles, commandExists, parseArgs, run, workspaceRoot, writeJson } from "./runtime-utils.mjs";

const args = parseArgs();
const dryRun = args.flags.has("dry-run");
const engine = args.options.get("engine") ?? process.env.SECURITY_SAST_ENGINE ?? "native";
const reportPath = args.options.get("report") ?? "test-results/security-sast/report.json";
const findings = [];
const rules = [
  { id: "eval", severity: "high", regex: /\beval\s*\(/g, message: "Avoid eval; use explicit parsers or dispatch tables." },
  { id: "new-function", severity: "high", regex: /\bnew\s+Function\s*\(/g, message: "Avoid dynamic code generation." },
  { id: "tls-disabled", severity: "critical", regex: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|rejectUnauthorized\s*:\s*false/g, message: "TLS verification must not be disabled." },
  { id: "dangerous-inner-html", severity: "medium", regex: /dangerouslySetInnerHTML|\.innerHTML\s*=/g, message: "Review HTML injection for sanitization." },
  { id: "shell-exec", severity: "medium", regex: /\bexec\s*\(/g, message: "Prefer spawn/execFile with array arguments over shell exec." },
  { id: "weak-random", severity: "medium", regex: /Math\.random\s*\(/g, message: "Do not use Math.random for security-sensitive values." },
];

if (engine === "semgrep" && !dryRun) {
  if (commandExists("semgrep")) {
    const result = run("semgrep", ["--config", "p/owasp-top-ten", "--config", "p/javascript", "--json", "."]);
    if (result.status !== 0) findings.push({ rule: "semgrep", severity: "high", message: "semgrep reported findings", stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-2000) });
  } else if (commandExists("docker")) {
    const result = run("docker", ["run", "--rm", "-v", `${process.cwd()}:/src`, "semgrep/semgrep", "semgrep", "--config", "p/owasp-top-ten", "--config", "p/javascript", "--json", "/src"]);
    if (result.status !== 0) findings.push({ rule: "semgrep-docker", severity: "high", message: "semgrep reported findings", stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-2000) });
  } else findings.push({ rule: "semgrep", severity: "high", message: "SECURITY_SAST_ENGINE=semgrep requested but semgrep/Docker is unavailable" });
}

function isProductionSource(path, rel) {
  if (![".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts"].includes(extname(path).toLowerCase())) {
    return false;
  }
  if (rel.endsWith(".d.ts")) return false;
  return !/(^|[./-])(spec|test|e2e-spec|component-spec)\.[cm]?[jt]sx?$/u.test(rel);
}

for (const file of collectFiles(workspaceRoot, { include: isProductionSource })) {
  const rel = relative(workspaceRoot, file).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");
  for (const rule of rules) for (const match of text.matchAll(rule.regex)) {
    if (rel.includes("security-sast.mjs")) continue;
    const line = text.slice(0, match.index).split("\n").length;
    findings.push({ file: rel, line, rule: rule.id, severity: rule.severity, message: rule.message });
  }
}

const failSeverities = new Set((process.env.SECURITY_SAST_FAIL_SEVERITIES ?? "critical,high").split(",").map((item) => item.trim()).filter(Boolean));
const failing = dryRun ? [] : findings.filter((finding) => failSeverities.has(finding.severity));
writeJson(reportPath, { status: failing.length ? "failed" : "ok", engine, dryRun, failSeverities: [...failSeverities], findings });
if (dryRun) {
  console.log(JSON.stringify({ status: "dry-run", engine, rules: rules.map((rule) => rule.id), report: reportPath }));
  process.exit(0);
}
if (failing.length) {
  console.error("Security SAST failed:");
  for (const finding of failing) console.error(`- ${finding.file ?? finding.rule}${finding.line ? `:${finding.line}` : ""} ${finding.rule} (${finding.severity})`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", engine, findings: findings.length, report: reportPath }));
