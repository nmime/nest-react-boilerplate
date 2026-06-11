#!/usr/bin/env node
// @ts-nocheck
import { existsSync } from "node:fs";
import { join } from "node:path";
import { commandExists, httpMethods, loadOpenApiContracts, parseArgs, resolveJsonPointer, run, walkRefs, writeJson } from "./runtime-utils.ts";

const args = parseArgs();
const engine = args.options.get("engine") ?? process.env.OPENAPI_LINT_ENGINE ?? "native";
const reportPath = args.options.get("report") ?? "test-results/openapi-lint/report.json";
const spectralVersion = args.options.get("spectral-version") ?? process.env.SPECTRAL_CLI_VERSION ?? "6.16.0";
const errors = [];
const warnings = [];
const contracts = loadOpenApiContracts();

for (const contract of contracts) {
  const { doc, path } = contract;
  if (!/^3\./.test(String(doc.openapi ?? ""))) errors.push(`${path}: openapi must be 3.x`);
  if (!doc.info?.title) errors.push(`${path}: info.title is required`);
  if (!doc.info?.version) errors.push(`${path}: info.version is required`);
  if (!doc.paths || Object.keys(doc.paths).length === 0) errors.push(`${path}: paths must not be empty`);
  if (!Array.isArray(doc.servers) || doc.servers.length === 0) warnings.push(`${path}: servers is empty; generated contracts are environment-neutral`);
  const operationIds = new Set();
  for (const [route, item] of Object.entries(doc.paths ?? {})) {
    if (!route.startsWith("/")) errors.push(`${path}: route ${route} must start with /`);
    for (const [method, operation] of Object.entries(item ?? {})) {
      if (!httpMethods.has(method)) continue;
      const label = `${path} ${method.toUpperCase()} ${route}`;
      if (!operation.operationId) errors.push(`${label}: missing operationId`);
      else if (operationIds.has(operation.operationId)) errors.push(`${label}: duplicate operationId ${operation.operationId}`);
      else operationIds.add(operation.operationId);
      if (!Array.isArray(operation.tags) || operation.tags.length === 0) errors.push(`${label}: missing tags`);
      if (!operation.responses || Object.keys(operation.responses).length === 0) errors.push(`${label}: missing responses`);
      if (!Object.keys(operation.responses ?? {}).some((status) => status === "default" || /^2\d\d$/.test(status))) warnings.push(`${label}: no explicit 2xx/default response`);
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        if (!Object.hasOwn(response, "description")) errors.push(`${label}: response ${status} missing description property`);
        else if (String(response.description).trim() === "") warnings.push(`${label}: response ${status} has an empty description`);
        for (const [mediaType, media] of Object.entries(response.content ?? {})) if (mediaType.includes("json") && !media.schema) errors.push(`${label}: response ${status} ${mediaType} missing schema`);
      }
      for (const [mediaType, media] of Object.entries(operation.requestBody?.content ?? {})) if (mediaType.includes("json") && !media.schema) errors.push(`${label}: requestBody ${mediaType} missing schema`);
      for (const requirement of operation.security ?? []) for (const name of Object.keys(requirement)) if (!doc.components?.securitySchemes?.[name]) errors.push(`${label}: references undefined security scheme ${name}`);
    }
  }
  walkRefs(doc, (ref) => {
    if (ref.startsWith("#/") && resolveJsonPointer(doc, ref) === undefined) errors.push(`${path}: unresolved $ref ${ref}`);
  });
}

let spectral = null;
if (engine === "spectral" || args.flags.has("spectral")) {
  const spectralArgs = ["dlx", `@stoplight/spectral-cli@${spectralVersion}`, "lint", ...contracts.map((contract) => contract.path), "--format", "json"];
  if (existsSync(".spectral.yaml")) spectralArgs.push("--ruleset", ".spectral.yaml");
  if (!commandExists("pnpm")) errors.push("Spectral lint requested but pnpm is not available");
  else {
    const result = run("pnpm", spectralArgs);
    spectral = { status: result.status, stdout: result.stdout, stderr: result.stderr };
    if (result.status !== 0) errors.push(`Spectral lint failed. Re-run with: pnpm ${spectralArgs.join(" ")}`);
  }
}

writeJson(reportPath, { status: errors.length ? "failed" : "ok", contracts: contracts.map((contract) => contract.file), errors, warnings, spectralVersion, spectral });
if (warnings.length) for (const warning of warnings) console.warn(`warning: ${warning}`);
if (errors.length) {
  console.error("OpenAPI lint failed:");
  for (const error of errors) console.error(`- ${error}`);
  console.error(`Report: ${join(process.cwd(), reportPath)}`);
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", contracts: contracts.length, warnings: warnings.length, report: reportPath }));
