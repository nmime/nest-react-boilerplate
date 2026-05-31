#!/usr/bin/env node
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { findOperation, loadOpenApiContracts, parseArgs, readJson, validateSchema, writeJson } from "./runtime-utils.mjs";

const args = parseArgs();
const root = args.options.get("contracts") ?? process.env.CONSUMER_CONTRACTS_ROOT ?? "contracts/consumers";
const reportPath = args.options.get("report") ?? "test-results/consumer-contracts/report.json";
const errors = [];
const warnings = [];
const results = [];

if (!existsSync(root)) errors.push(`Consumer contract directory not found: ${root}`);
else {
  const providers = loadOpenApiContracts();
  const byName = new Map();
  for (const contract of providers) {
    byName.set(contract.file.replace(/\.json$/, ""), contract);
    if (contract.doc.info?.title) byName.set(contract.doc.info.title, contract);
  }
  for (const file of readdirSync(root).filter((name) => name.endsWith(".json")).sort()) {
    const pact = readJson(join(root, file));
    const providerName = pact.provider?.name ?? pact.providerName;
    const provider = byName.get(providerName);
    if (!provider) {
      errors.push(`${file}: provider ${providerName} does not match any OpenAPI contract`);
      continue;
    }
    for (const [index, interaction] of (pact.interactions ?? []).entries()) {
      const label = `${file} interaction ${index + 1} (${interaction.description ?? "unnamed"})`;
      const request = interaction.request ?? {};
      const response = interaction.response ?? {};
      const method = String(request.method ?? "").toLowerCase();
      const requestPath = request.path ?? request.pathname;
      if (!method || !requestPath) {
        errors.push(`${label}: request.method and request.path are required`);
        continue;
      }
      const match = findOperation(provider, method, requestPath);
      if (!match) {
        errors.push(`${label}: ${method.toUpperCase()} ${requestPath} is not defined by ${provider.file}`);
        continue;
      }
      const status = String(response.status ?? response.statusCode ?? "");
      if (status && !match.operation.responses?.[status] && !match.operation.responses?.default) errors.push(`${label}: response status ${status} is not declared by ${provider.file}`);
      if ((match.operation.security ?? []).length && !request.headers?.Authorization && !request.headers?.authorization) warnings.push(`${label}: provider operation is secured but contract request has no Authorization header`);
      const requestMedia = Object.values(match.operation.requestBody?.content ?? {}).find((media) => media?.schema);
      if (request.body !== undefined && requestMedia?.schema) errors.push(...validateSchema(request.body, requestMedia.schema, provider.doc, `${label}.request.body`));
      const declaredResponse = match.operation.responses?.[status] ?? match.operation.responses?.default;
      const responseMedia = Object.values(declaredResponse?.content ?? {}).find((media) => media?.schema);
      if (response.body !== undefined && responseMedia?.schema) errors.push(...validateSchema(response.body, responseMedia.schema, provider.doc, `${label}.response.body`));
      results.push({ file, provider: provider.file, description: interaction.description, method: method.toUpperCase(), path: requestPath, status, ok: true });
    }
  }
}

writeJson(reportPath, { status: errors.length ? "failed" : "ok", root, interactions: results, warnings, errors });
if (warnings.length) for (const warning of warnings) console.warn(`warning: ${warning}`);
if (errors.length) {
  console.error("Consumer contract checks failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", contractsRoot: root, interactions: results.length, warnings: warnings.length, report: reportPath }));
