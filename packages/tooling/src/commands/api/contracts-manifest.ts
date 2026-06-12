// @ts-nocheck
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const apiContractsManifestPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../config/api-contracts.json",
);

function readManifest() {
  return JSON.parse(readFileSync(apiContractsManifestPath, "utf8"));
}

export function loadApiContractsManifest() {
  const manifest = readManifest();
  return {
    ...manifest,
    openapi: [...(manifest.openapi ?? [])],
    consumers: [...(manifest.consumers ?? [])],
  };
}

export function openApiContracts() {
  return loadApiContractsManifest().openapi;
}

export function consumerContracts() {
  return loadApiContractsManifest().consumers;
}

export function openApiContractByName(name) {
  const contract = openApiContracts().find((item) => item.name === name);
  if (!contract)
    throw new Error(
      `Unknown OpenAPI contract in ${relative(process.cwd(), apiContractsManifestPath)}: ${name}`,
    );
  return contract;
}
