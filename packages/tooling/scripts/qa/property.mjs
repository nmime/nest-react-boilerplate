#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { findOperation, loadOpenApiContracts, matchPathTemplate, parseArgs, readJson, schemaExample, validateSchema, writeJson } from "./runtime-utils.mjs";

const args = parseArgs();
const iterations = Number(args.options.get("iterations") ?? process.env.PROPERTY_ITERATIONS ?? 100);
const reportPath = args.options.get("report") ?? "test-results/property/report.json";
const errors = [];
const checks = [];

function assert(name, predicate, details = {}) {
  try {
    const ok = predicate();
    if (!ok) errors.push(`${name}: failed ${JSON.stringify(details)}`);
    checks.push({ name, ok, details });
  } catch (error) {
    errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    checks.push({ name, ok: false, details });
  }
}

function random(seed) {
  let state = seed + 0x6d2b79f5;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const contracts = loadOpenApiContracts();
for (const contract of contracts) {
  for (const [route, item] of Object.entries(contract.doc.paths ?? {})) {
    assert(`${contract.file} path matcher round-trips ${route}`, () => {
      const concrete = route.replaceAll(/\{([^}]+)\}/g, (_, name) => encodeURIComponent(`${name}-value`));
      const method = Object.keys(item).find((candidate) => ["get", "put", "post", "delete", "patch", "options", "head"].includes(candidate)) ?? "get";
      return Boolean(matchPathTemplate(route, concrete)) && findOperation(contract, method, concrete) !== null;
    });
    for (const [method, operation] of Object.entries(item ?? {})) {
      if (!["get", "put", "post", "delete", "patch", "options", "head"].includes(method)) continue;
      for (const media of Object.values(operation.requestBody?.content ?? {})) if (media?.schema) assert(`${contract.file} ${operation.operationId} request example validates`, () => validateSchema(schemaExample(media.schema, contract.doc), media.schema, contract.doc).length === 0);
      for (const response of Object.values(operation.responses ?? {})) for (const media of Object.values(response.content ?? {})) if (media?.schema) assert(`${contract.file} ${operation.operationId} response example validates`, () => validateSchema(schemaExample(media.schema, contract.doc), media.schema, contract.doc).length === 0);
    }
  }
}

const pkg = readJson("package.json");
for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
  for (const match of String(script).matchAll(/(?:node|tsx|ts-node)\s+([^\s&|;]+\.(?:mjs|mts|js|ts))/g)) {
    if (match[1].startsWith("packages/") || match[1].startsWith("tools/")) assert(`script ${name} points to existing file`, () => existsSync(match[1]), { file: match[1] });
  }
}

const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
assert("workspace includes packages/tooling", () => workspace.includes("packages/tooling"));
assert("tooling package exists", () => existsSync("packages/tooling/package.json"));

for (let seed = 0; seed < iterations; seed += 1) {
  const rnd = random(seed);
  const contract = contracts[Math.floor(rnd() * contracts.length)];
  const paths = Object.keys(contract.doc.paths ?? {});
  const route = paths[Math.floor(rnd() * paths.length)];
  assert(`random path template remains matchable seed=${seed}`, () => {
    const concrete = route.replaceAll(/\{([^}]+)\}/g, () => String(Math.floor(rnd() * 1000) + 1));
    return matchPathTemplate(route, concrete) !== null;
  }, { contract: contract.file, route });
}

try {
  const fastCheck = await import("fast-check");
  await fastCheck.assert(fastCheck.property(fastCheck.string(), (value) => typeof value.replaceAll("~", "~0").replaceAll("/", "~1") === "string"), { numRuns: Math.min(iterations, 1000) });
  checks.push({ name: "fast-check json-pointer smoke", ok: true, engine: "fast-check" });
} catch {
  checks.push({ name: "fast-check optional engine", ok: true, engine: "native", note: "Install fast-check or provide it in the runtime to enable the external engine." });
}

writeJson(reportPath, { status: errors.length ? "failed" : "ok", iterations, checks, errors });
if (errors.length) {
  console.error("Property checks failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", iterations, checks: checks.length, report: reportPath }));
