// @ts-nocheck
import { consumerContracts, openApiContracts } from "./contracts-manifest.ts";

export const API_CONTRACTS_WORKSPACE_ROOT = "libs/common/api-contracts";
export const API_CONTRACT_TYPES_ROOT = `${API_CONTRACTS_WORKSPACE_ROOT}/lib/src/generated`;
export const FRONTEND_API_CLIENT_GENERATED_ROOT =
  "libs/frontend/api-client/lib/src/generated";

const openApi = openApiContracts();
const consumers = consumerContracts();

export const OPENAPI_CONTRACT_FILES = {
  admin: openApi.find((contract) => contract.name === "admin-app-api")
    ?.artifactPath,
  auth: openApi.find((contract) => contract.name === "auth-app-api")
    ?.artifactPath,
  user: openApi.find((contract) => contract.name === "user-app-api")
    ?.artifactPath,
} as const;

export const OPENAPI_CONTRACT_PATHS = openApi.map(
  (contract) => contract.artifactPath,
);
export const CONSUMER_CONTRACT_PATHS = consumers.map(
  (contract) => contract.artifactPath,
);
export const CONSUMER_CONTRACTS_ROOTS = [
  ...new Set(
    consumers.map((contract) =>
      contract.artifactPath.replace(/\/[^/]+$/, ""),
    ),
  ),
];
