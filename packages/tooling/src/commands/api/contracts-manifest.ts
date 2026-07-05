import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export interface OpenApiContract {
  name: string;
  app: string;
  port: number;
  artifactPath: string;
  typesPath: string;
  clientOutputPath: string;
}

export interface ConsumerContract {
  name: string;
  provider: string;
  artifactPath: string;
}

export interface ApiContractsManifest {
  openapi: OpenApiContract[];
  consumers: ConsumerContract[];
}

export const apiContractsManifestPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../config/api-contracts.json",
);

function readManifest(): ApiContractsManifest {
  return JSON.parse(
    readFileSync(apiContractsManifestPath, "utf8"),
  ) as ApiContractsManifest;
}

export function loadApiContractsManifest(): ApiContractsManifest {
  const manifest = readManifest();
  return {
    ...manifest,
    openapi: [...(manifest.openapi ?? [])],
    consumers: [...(manifest.consumers ?? [])],
  };
}

export function openApiContracts(): OpenApiContract[] {
  return loadApiContractsManifest().openapi;
}

export function consumerContracts(): ConsumerContract[] {
  return loadApiContractsManifest().consumers;
}

export function openApiContractByName(name: string): OpenApiContract {
  const contract = openApiContracts().find((item) => item.name === name);
  if (!contract)
    throw new Error(
      `Unknown OpenAPI contract in ${relative(process.cwd(), apiContractsManifestPath)}: ${name}`,
    );
  return contract;
}
