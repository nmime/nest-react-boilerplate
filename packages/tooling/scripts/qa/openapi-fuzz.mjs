#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commandExists, envList, loadOpenApiContracts, parseArgs, run, schemaExample, slug, validateSchema, writeJson } from "./runtime-utils.mjs";

const args = parseArgs();
const dryRun = args.flags.has("dry-run");
const engine = args.options.get("engine") ?? process.env.OPENAPI_FUZZ_ENGINE ?? "native";
const out = args.options.get("report") ?? "test-results/openapi-fuzz/report.json";
const safeMethods = new Set(["get", "head", "options"]);
const allowUnsafe = process.env.OPENAPI_FUZZ_UNSAFE === "1";
const globalBaseUrls = envList("OPENAPI_FUZZ_BASE_URL");
const contracts = loadOpenApiContracts();
const cases = [];
const live = [];

function baseUrlsFor(contract) {
  const contractSlug = slug(contract.doc.info?.title ?? contract.file).toUpperCase().replaceAll("-", "_");
  return envList(`OPENAPI_FUZZ_BASE_URL_${contractSlug}`, globalBaseUrls);
}

function operationCase(contract, route, method, operation) {
  const requestSchema = Object.values(operation.requestBody?.content ?? {}).find((media) => media?.schema)?.schema;
  const validBody = requestSchema ? schemaExample(requestSchema, contract.doc) : undefined;
  const invalidBodies = requestSchema ? [null, {}, "__qa_invalid_type__"] : [];
  return { contract: contract.file, provider: contract.doc.info?.title, method: method.toUpperCase(), path: route, operationId: operation.operationId, safe: safeMethods.has(method), validBody, invalidBodies, probes: [0, 1, 13, 42].map((seed) => ({ seed, query: `__qa_fuzz=${seed}` })) };
}

for (const contract of contracts) {
  for (const [route, item] of Object.entries(contract.doc.paths ?? {})) {
    for (const [method, operation] of Object.entries(item ?? {})) {
      if (!["get", "put", "post", "delete", "patch", "options", "head"].includes(method)) continue;
      const itemCase = operationCase(contract, route, method, operation);
      cases.push(itemCase);
      if (itemCase.validBody !== undefined) {
        const schema = Object.values(operation.requestBody?.content ?? {}).find((media) => media?.schema)?.schema;
        const validation = validateSchema(itemCase.validBody, schema, contract.doc);
        if (validation.length) live.push({ operationId: operation.operationId, staticValidation: validation, ok: false });
      }
    }
  }
}

if (engine === "schemathesis" && !dryRun) {
  if (!globalBaseUrls.length) live.push({ engine: "schemathesis", ok: false, error: "OPENAPI_FUZZ_BASE_URL is required for Schemathesis live fuzzing" });
  else if (commandExists("schemathesis")) {
    for (const contract of contracts) {
      const result = run("schemathesis", ["run", contract.path, "--base-url", globalBaseUrls[0], "--checks", "all", "--max-examples", process.env.OPENAPI_FUZZ_MAX_EXAMPLES ?? "25"]);
      live.push({ engine: "schemathesis", contract: contract.file, status: result.status, ok: result.status === 0, stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-4000) });
    }
  } else if (commandExists("docker")) {
    for (const contract of contracts) {
      const result = run("docker", ["run", "--rm", "-v", `${process.cwd()}:/work`, "schemathesis/schemathesis:stable", "run", `/work/${contract.path}`, "--base-url", globalBaseUrls[0], "--checks", "all", "--max-examples", process.env.OPENAPI_FUZZ_MAX_EXAMPLES ?? "25"]);
      live.push({ engine: "schemathesis-docker", contract: contract.file, status: result.status, ok: result.status === 0, stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-4000) });
    }
  } else live.push({ engine: "schemathesis", ok: false, error: "Install schemathesis or Docker to run OPENAPI_FUZZ_ENGINE=schemathesis" });
}

if (!dryRun && engine !== "schemathesis") {
  for (const contract of contracts) {
    for (const baseUrl of baseUrlsFor(contract)) {
      for (const item of cases.filter((candidate) => candidate.contract === contract.file && (candidate.safe || allowUnsafe))) {
        const path = item.path.replaceAll(/\{[^}]+\}/g, "1");
        const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
        url.searchParams.set("__qa_fuzz", "0");
        try {
          const response = await fetch(url, { method: item.method, headers: { accept: "application/json", "x-qa-fuzz": "openapi" }, signal: AbortSignal.timeout(Number(process.env.OPENAPI_FUZZ_TIMEOUT_MS ?? 10000)) });
          live.push({ operationId: item.operationId, url: String(url), method: item.method, status: response.status, ok: response.status < 500 });
        } catch (error) {
          live.push({ operationId: item.operationId, url: String(url), method: item.method, error: error instanceof Error ? error.message : String(error), ok: false });
        }
      }
    }
  }
}

mkdirSync("test-results/openapi-fuzz", { recursive: true });
writeFileSync(join("test-results/openapi-fuzz", "cases.json"), `${JSON.stringify(cases, null, 2)}\n`);
const failed = live.some((item) => item.ok === false);
writeJson(out, { status: failed ? "violations" : "ok", engine, dryRun, generatedAt: new Date().toISOString(), cases, live });
console.log(JSON.stringify({ status: failed ? "violations" : "ok", dryRun, engine, cases: cases.length, live: live.length, report: out }));
if (failed) process.exit(1);
