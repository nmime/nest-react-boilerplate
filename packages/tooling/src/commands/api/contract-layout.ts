export const API_CONTRACTS_WORKSPACE_ROOT = "libs/common/api-contracts";
export const OPENAPI_CONTRACTS_ROOT = `${API_CONTRACTS_WORKSPACE_ROOT}/openapi`;
export const CONSUMER_CONTRACTS_ROOT = `${API_CONTRACTS_WORKSPACE_ROOT}/consumers`;
export const API_CONTRACT_TYPES_ROOT = `${API_CONTRACTS_WORKSPACE_ROOT}/lib/src/generated`;
export const FRONTEND_API_CLIENT_GENERATED_ROOT =
  "libs/frontend/api-client/lib/src/generated";

export const OPENAPI_CONTRACT_FILES = {
  admin: `${OPENAPI_CONTRACTS_ROOT}/admin-app-api.json`,
  auth: `${OPENAPI_CONTRACTS_ROOT}/auth-app-api.json`,
  user: `${OPENAPI_CONTRACTS_ROOT}/user-app-api.json`,
} as const;
