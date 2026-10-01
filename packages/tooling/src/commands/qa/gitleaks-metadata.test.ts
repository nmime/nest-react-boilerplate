// @requirements REQ-SCAFFOLD-QUALITY-006
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const binary = process.env["NRB_GITLEAKS_CANARY_BINARY"];
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const auditPath = "docs/boilerplate/template-audit-2026-10-01/evidence.json";
const publicTag = "final-pg-6dca9b8";

type Finding = { RuleID: string; File: string; Match: string };

function scan(path: string, text: string): Finding[] {
  assert.ok(binary, "the real engine must be supplied explicitly");
  const workspace = mkdtempSync(join(tmpdir(), "nrb-gitleaks-metadata-"));
  try {
    const baseConfig = "packages/tooling/config/gitleaks.base.toml";
    mkdirSync(dirname(join(workspace, baseConfig)), { recursive: true });
    copyFileSync(join(root, ".gitleaks.toml"), join(workspace, ".gitleaks.toml"));
    copyFileSync(join(root, baseConfig), join(workspace, baseConfig));
    mkdirSync(dirname(join(workspace, path)), { recursive: true });
    writeFileSync(join(workspace, path), `${text}\n`);
    const report = join(workspace, "findings.json");
    const result = spawnSync(binary, ["dir", "--config", ".gitleaks.toml", "--redact=100", "--exit-code=2", "--report-format=json", "--report-path", report, "."], {
      cwd: workspace,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.ifError(result.error);
    assert.ok(result.status === 0 || result.status === 2, "the scanner must complete, rather than fail to load its policy");
    return JSON.parse(readFileSync(report, "utf8")) as Finding[];
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

// Static tooling checks need no external engine. The required Gitleaks CI job supplies its
// installed, pinned binary and executes every case; an absent/wrong binary then fails the job.
describe("real Gitleaks audit metadata policy", { skip: binary === undefined }, () => {
  it("uses the engine version pinned by the CI job", () => {
    assert.ok(binary);
    const version = spawnSync(binary, ["version"], { encoding: "utf8", timeout: 10_000 });
    assert.ifError(version.error);
    assert.equal(version.status, 0);
    assert.equal(version.stdout.trim(), process.env["GITLEAKS_VERSION"]);
  });

  it("accepts only the three published image-reference lines", () => {
    const text = ["admin", "auth", "user"].map((service) => `  "scanReference": "nrb/${service}-app-api:${publicTag}",`).join("\n");
    assert.deepEqual(scan(auditPath, text), []);
  });

  it("keeps credentials on another line in the audit detectable", () => {
    const secret = randomBytes(32).toString("hex");
    const findings = scan(auditPath, `"scanReference": "nrb/auth-app-api:${publicTag}",\n"api_key": "${secret}"`);
    assert.ok(findings.some((finding) => finding.RuleID === "generic-api-key" && finding.Match.includes("api_key")));
  });

  it("keeps credentials on the same line as the metadata detectable", () => {
    const secret = randomBytes(32).toString("hex");
    const findings = scan(auditPath, `"scanReference": "nrb/auth-app-api:${publicTag}", "api_key": "${secret}"`);
    assert.ok(findings.some((finding) => finding.RuleID === "generic-api-key" && finding.Match.includes("api_key")));
  });

  it("does not allow the public tag in a credential assignment", () => {
    assert.ok(scan(auditPath, `"api_key": "${publicTag}"`).some((finding) => finding.RuleID === "generic-api-key"));
  });

  it("does not extend the exception to another file", () => {
    assert.ok(scan("src/runtime-config.json", `"scanReference": "nrb/auth-app-api:${publicTag}",`).some((finding) => finding.RuleID === "generic-api-key"));
  });

  it("does not extend the exception to an unreviewed image tag", () => {
    const unreviewedTag = `${publicTag.slice(0, -1)}9`;
    assert.ok(scan(auditPath, `"scanReference": "nrb/auth-app-api:${unreviewedTag}",`).some((finding) => finding.RuleID === "generic-api-key"));
  });
});
