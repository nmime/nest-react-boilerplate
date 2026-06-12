#!/usr/bin/env node
// @ts-nocheck
import { findOperation, loadConsumerContracts, loadOpenApiContracts, parseArgs, validateSchema, writeJson } from "./runtime-utils.ts";
const args = parseArgs();
const root = args.options.get("contracts") ?? process.env.CONSUMER_CONTRACTS_ROOT;
const reportPath = args.options.get("report") ?? "test-results/consumer-contracts/report.json";
const errors = [];
const warnings = [];
const results = [];
function hasHeader(headers, name) { const wanted = name.toLowerCase(); return Object.keys(headers).some((header) => header.toLowerCase() === wanted); }
function securityRequirementSatisfied(requirement, doc, headers) { return Object.keys(requirement).every((schemeName) => { const scheme = doc.components?.securitySchemes?.[schemeName]; if (scheme?.type === "apiKey" && scheme.in === "cookie") return hasHeader(headers, "Cookie"); if (scheme?.type === "http" && scheme.scheme === "bearer") return hasHeader(headers, "Authorization"); return false; }); }
function isSecuritySatisfied(security, doc, headers) { if (!security.length) return true; return security.some((requirement) => securityRequirementSatisfied(requirement, doc, headers)); }
try {
  const providers = loadOpenApiContracts();
  const byName = new Map();
  for (const contract of providers) { byName.set(contract.file.replace(/\.json$/, ""), contract); if (contract.doc.info?.title) byName.set(contract.doc.info.title, contract); }
  for (const consumer of loadConsumerContracts(root)) {
    const file = consumer.file;
    const pact = consumer.doc;
    const providerName = pact.provider?.name ?? pact.providerName;
    const provider = byName.get(providerName);
    if (!provider) { errors.push(`${file}: provider ${providerName} does not match any OpenAPI contract`); continue; }
    for (const [index, interaction] of (pact.interactions ?? []).entries()) {
      const label = `${file} interaction ${index + 1} (${interaction.description ?? "unnamed"})`;
      const request = interaction.request ?? {};
      const response = interaction.response ?? {};
      const method = String(request.method ?? "").toLowerCase();
      const requestPath = request.path ?? request.pathname;
      if (!method || !requestPath) { errors.push(`${label}: request.method and request.path are required`); continue; }
      const match = findOperation(provider, method, requestPath);
      if (!match) { errors.push(`${label}: ${method.toUpperCase()} ${requestPath} is not defined by ${provider.file}`); continue; }
      const status = String(response.status ?? response.statusCode ?? "");
      if (status && !match.operation.responses?.[status] && !match.operation.responses?.default) errors.push(`${label}: response status ${status} is not declared by ${provider.file}`);
      if (!isSecuritySatisfied(match.operation.security ?? [], provider.doc, request.headers ?? {})) warnings.push(`${label}: provider operation is secured but contract request has no matching Authorization or Cookie header`);
      const requestMedia = Object.values(match.operation.requestBody?.content ?? {}).find((media) => media?.schema);
      if (request.body !== undefined && requestMedia?.schema) errors.push(...validateSchema(request.body, requestMedia.schema, provider.doc, `${label}.request.body`));
      const declaredResponse = match.operation.responses?.[status] ?? match.operation.responses?.default;
      const responseMedia = Object.values(declaredResponse?.content ?? {}).find((media) => media?.schema);
      if (response.body !== undefined && responseMedia?.schema) errors.push(...validateSchema(response.body, responseMedia.schema, provider.doc, `${label}.response.body`));
      results.push({ file, provider: provider.file, description: interaction.description, method: method.toUpperCase(), path: requestPath, status, ok: true });
    }
  }
} catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
writeJson(reportPath, { status: errors.length ? "failed" : "ok", root: root ?? "packages/tooling/config/api-contracts.json", interactions: results, warnings, errors });
if (warnings.length) for (const warning of warnings) console.warn(`warning: ${warning}`);
if (errors.length) { console.error("Consumer contract checks failed:"); for (const error of errors) console.error(`- ${error}`); process.exit(1); }
console.log(JSON.stringify({ status: "ok", contractsRoot: root ?? "packages/tooling/config/api-contracts.json", interactions: results.length, warnings: warnings.length, report: reportPath }));
