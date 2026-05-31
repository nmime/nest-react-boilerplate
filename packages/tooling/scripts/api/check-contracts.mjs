#!/usr/bin/env node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
const contractsRoot = "contracts/openapi";
const typesRoot = "libs/common/api-contracts/lib/src/generated";
function listFiles(root) { const files = []; const visit = (dir) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) visit(path); else files.push(path); } }; visit(root); return files.sort(); }
function compareTrees(expectedRoot, actualRoot) { const expected = listFiles(expectedRoot).map((f) => relative(expectedRoot, f)); const actual = listFiles(actualRoot).map((f) => relative(actualRoot, f)); const diffs = []; for (const name of [...new Set([...expected, ...actual])].sort()) { if (!expected.includes(name)) diffs.push(`extra committed file: ${join(actualRoot, name)}`); else if (!actual.includes(name)) diffs.push(`missing committed file: ${join(actualRoot, name)}`); else if (readFileSync(join(expectedRoot, name), "utf8") !== readFileSync(join(actualRoot, name), "utf8")) diffs.push(`stale file: ${join(actualRoot, name)}`); } return diffs; }
const temp = mkdtempSync(join(tmpdir(), "api-contracts-"));
try { const generatedContracts = join(temp, "openapi"); const generatedTypes = join(temp, "generated"); const result = spawnSync("node", ["packages/tooling/scripts/api/generate-contracts.mjs", "--contracts-root", generatedContracts, "--types-root", generatedTypes], { stdio: "inherit" }); if (result.status !== 0) process.exit(result.status ?? 1); const diffs = [...compareTrees(generatedContracts, contractsRoot), ...compareTrees(generatedTypes, typesRoot)]; if (diffs.length) { console.error("API contracts are stale. Run `pnpm api:contracts`."); for (const diff of diffs) console.error(`- ${diff}`); process.exit(1); } console.log(JSON.stringify({ status: "fresh", contractsRoot, typesRoot })); } finally { rmSync(temp, { recursive: true, force: true }); }
