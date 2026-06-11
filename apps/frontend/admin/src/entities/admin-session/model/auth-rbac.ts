import { adminApi, throwOnOpenApiErrorData } from "@app/api-client";
import {
  createAdminAccessPolicy,
  type AdminAccessPolicy,
  type AdminPrincipalClaims,
} from "@app/frontend/feature-admin-shared";
import {
  getRequiredApiBaseUrl,
  type FrontendEnv,
} from "@app/frontend-api-support";

export type AdminPrincipal = Partial<adminApi.AuthenticatedPrincipalDto>;

export type AdminProfilePayload = Partial<
  Omit<adminApi.AdminProfilePayloadDto, "principal" | "profile">
> & {
  principal?: AdminPrincipal;
  profile?: Partial<adminApi.AdminProfilePayloadDto["profile"]>;
};

export type AdminAccess = AdminAccessPolicy;

export const normalizeClaimList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value.filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        ),
      ),
    ];
  }

  return [];
};

export const createAdminAccess = (principal?: AdminPrincipal): AdminAccess =>
  createAdminAccessPolicy({
    permissions: normalizeClaimList(principal?.permissions),
    roles: normalizeClaimList(principal?.roles),
    subject: principal?.subject,
  } satisfies AdminPrincipalClaims);

export const getAdminApiBaseUrl = (env: FrontendEnv): string =>
  getRequiredApiBaseUrl(env, "VITE_ADMIN_API_BASE_URL");

export const getAuthApiBaseUrl = (env: FrontendEnv): string =>
  getRequiredApiBaseUrl(env, "VITE_AUTH_API_BASE_URL");

export const fetchAdminProfile = async (
  apiBaseUrl = "",
  authToken?: string | null,
): Promise<AdminProfilePayload> => {
  return throwOnOpenApiErrorData(
    adminApi.adminProfileControllerMe({
      authToken: authToken?.trim() || undefined,
      baseUrl: apiBaseUrl,
    }),
  );
};
