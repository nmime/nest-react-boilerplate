// @ts-nocheck
import { consumerContracts, openApiContracts } from "./contracts-manifest.ts";

export const ApiContractsWorkspaceRoot = "libs/common/api-contracts";
export const ApiContractTypesRoot = `${ApiContractsWorkspaceRoot}/lib/src/generated`;
export const FrontendApiClientGeneratedRoot =
  "libs/frontend/api-client/lib/src/generated";

const openApi = openApiContracts();
const consumers = consumerContracts();

export const OpenApiContractFiles = {
  admin: openApi.find((contract) => contract.name === "admin-app-api")
    ?.artifactPath,
  auth: openApi.find((contract) => contract.name === "auth-app-api")
    ?.artifactPath,
  user: openApi.find((contract) => contract.name === "user-app-api")
    ?.artifactPath,
} as const;

export const OpenApiContractPaths = openApi.map(
  (contract) => contract.artifactPath,
);
export const ConsumerContractPaths = consumers.map(
  (contract) => contract.artifactPath,
);
export const ConsumerContractsRoots = [
  ...new Set(
    consumers.map((contract) =>
      contract.artifactPath.replace(/\/[^/]+$/, ""),
    ),
  ),
];
