#!/usr/bin/env node
import { QualityEngineImages } from "./quality-engine-images.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commandExists, envList, loadOpenApiContracts, parseArgs, run, schemaExample, slug, validateSchema, writeJson } from "./runtime-utils.ts";
import type { LoadedOpenApiContract, OpenApiOperation } from "./runtime-utils.ts";

import { boundedInteger } from "./world-class-policy.ts";

const args = parseArgs();
const dryRun = args.flags.has("dry-run");
const engine = args.options.get("engine") ?? process.env.OPENAPI_FUZZ_ENGINE ?? "native";
if (!['native', 'schemathesis'].includes(engine)) throw new Error(`Unknown fuzz engine: ${engine}`);
const timeoutMs = boundedInteger({ fallback: 10000, label: 'OPENAPI_FUZZ_TIMEOUT_MS', min: 100, max: 120_000, value: process.env.OPENAPI_FUZZ_TIMEOUT_MS });
const maxExamples = boundedInteger({ fallback: 25, label: 'OPENAPI_FUZZ_MAX_EXAMPLES', max: 200, value: process.env.OPENAPI_FUZZ_MAX_EXAMPLES });
const out = args.options.get("report") ?? "test-results/openapi-fuzz/report.json";
const safeMethods = new Set(["get", "head", "options"]);
const allowUnsafe = process.env.OPENAPI_FUZZ_UNSAFE === "1";
const globalBaseUrls = envList("OPENAPI_FUZZ_BASE_URL");
const contracts = loadOpenApiContracts();
interface FuzzCase {
  contract: string;
  provider?: string;
  method: string;
  path: string;
  operationId?: string;
  safe: boolean;
  validBody: unknown;
  invalidBodies: unknown[];
  probes: { seed: number; query: string }[];
}
const cases: FuzzCase[] = [];
const live: Record<string, unknown>[] = [];

function baseUrlsFor(contract: LoadedOpenApiContract): string[] {
  const contractSlug = slug(contract.doc.info?.title ?? contract.file).toUpperCase().replaceAll("-", "_");
  return envList(`OPENAPI_FUZZ_BASE_URL_${contractSlug}`, globalBaseUrls);
}

function operationCase(contract: LoadedOpenApiContract, route: string, method: string, operation: OpenApiOperation): FuzzCase {
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

let executed = 0;
if (engine === "schemathesis" && !dryRun) {
  const methodSelection = allowUnsafe ? [] : ['--include-method-regex', '^(GET|HEAD|OPTIONS)$', '--phases', 'examples,fuzzing'];
  // Unsupported-method and stateful checks can send writes outside the selected operation.
  const checks = allowUnsafe ? 'all' : 'not_a_server_error,status_code_conformance,content_type_conformance,response_schema_conformance';
  for (const contract of contracts) {
    const eligible = cases.filter((item) => item.contract === contract.file && (item.safe || allowUnsafe));
    if (!eligible.length) continue;
    for (const baseUrl of baseUrlsFor(contract)) {
      const cliArgs = ['run', contract.path, '--base-url', baseUrl, '--checks', checks, '--max-examples', String(maxExamples), ...methodSelection];
      let result;
      if (commandExists('schemathesis')) result = run('schemathesis', cliArgs);
      else if (commandExists('docker')) {
        result = run('docker', ['run', '--rm', '-v', `${process.cwd()}:/work:ro`, '--workdir', '/work', QualityEngineImages.schemathesis, ...cliArgs]);
      } else {
        live.push({engine: 'schemathesis', ok: false, error: 'Install schemathesis or Docker to run the selected fuzz engine.'});
        continue;
      }
      executed += 1;
      live.push({engine: 'schemathesis', contract: contract.file, status: result.status, ok: result.status === 0, stdout: result.stdout.slice(-4000), stderr: result.stderr.slice(-4000)});
    }
  }
}

if (!dryRun && engine === 'native') {
  for (const contract of contracts) {
    for (const baseUrl of baseUrlsFor(contract)) {
      for (const item of cases.filter((candidate) => candidate.contract === contract.file && (candidate.safe || allowUnsafe))) {
        const path = item.path.replaceAll(/\{[^}]+\}/g, '1');
        const bodies = item.validBody === undefined ? [{kind: 'none', body: undefined}] : [
          {kind: 'valid', body: item.validBody},
          ...item.invalidBodies.map((body, index) => ({kind: `invalid-${index + 1}`, body})),
        ];
        for (const probe of item.probes) for (const variant of bodies) {
          const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
          url.searchParams.set('__qa_fuzz', String(probe.seed));
          // Fetch forbids GET/HEAD bodies; their query probes still execute independently.
          const body = item.method === 'GET' || item.method === 'HEAD' ? undefined : variant.body === undefined ? undefined : JSON.stringify(variant.body);
          try {
            executed += 1;
            const response = await fetch(url, { method: item.method, headers: { accept: 'application/json', 'x-qa-fuzz': 'openapi', ...(body === undefined ? {} : {'content-type': 'application/json'}) }, body, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
            await response.arrayBuffer();
            live.push({operationId: item.operationId, url: String(url), method: item.method, seed: probe.seed, bodyVariant: variant.kind, status: response.status, ok: response.status < 500});
          } catch (error) {
            live.push({operationId: item.operationId, url: String(url), method: item.method, seed: probe.seed, bodyVariant: variant.kind, error: error instanceof Error ? error.message : String(error), ok: false});
          }
        }
      }
    }
  }
}
if (!dryRun && executed === 0 && (engine === 'schemathesis' || process.env.OPENAPI_FUZZ_REQUIRE_TARGET === '1')) {
  live.push({engine, ok: false, error: 'No eligible live fuzz probes executed. Configure targets for a contract with selected methods.'});
}

mkdirSync("test-results/openapi-fuzz", { recursive: true });
writeFileSync(join("test-results/openapi-fuzz", "cases.json"), `${JSON.stringify(cases, null, 2)}\n`);
const failed = live.some((item) => item.ok === false);
const status = failed ? "violations" : dryRun ? "dry-run" : executed === 0 ? "planned" : "ok";
writeJson(out, { status, engine, dryRun, executed, generatedAt: new Date().toISOString(), cases, live });
console.log(JSON.stringify({ status, dryRun, engine, executed, cases: cases.length, live: live.length, report: out }));
if (failed) process.exit(1);
