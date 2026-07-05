#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { openApiContracts } from "./contracts-manifest.ts";

function compareFiles(expected: string, actual: string) {
  if (readFileSync(expected, "utf8") === readFileSync(actual, "utf8")) return [];
  return [`stale file: ${actual}`];
}

const temp = mkdtempSync(join(tmpdir(), "api-contracts-"));
// Capture the exit code and exit after the finally block so the temp dir is
// always cleaned up; process.exit() inside try would skip finally.
let exitCode = 0;
try {
  const generatedContracts = join(temp, "openapi");
  const generatedTypes = join(temp, "generated");
  const result = spawnSync("node", ["packages/tooling/bin/repo-tooling.mjs", "api", "contracts", "--contracts-root", generatedContracts, "--types-root", generatedTypes], { stdio: "inherit" });
  if (result.status !== 0) {
    exitCode = result.status ?? 1;
  } else {
    const diffs = [];
    for (const contract of openApiContracts()) {
      diffs.push(...compareFiles(join(generatedContracts, basename(contract.artifactPath)), contract.artifactPath));
      diffs.push(...compareFiles(join(generatedTypes, basename(contract.typesPath)), contract.typesPath));
    }
    if (diffs.length) {
      console.error("API contracts are stale. Run `pnpm api:contracts`.");
      for (const diff of diffs) console.error(`- ${diff}`);
      exitCode = 1;
    } else {
      console.log(JSON.stringify({ status: "fresh", contracts: openApiContracts().map((contract) => contract.artifactPath), types: openApiContracts().map((contract) => contract.typesPath) }));
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
if (exitCode !== 0) process.exit(exitCode);
