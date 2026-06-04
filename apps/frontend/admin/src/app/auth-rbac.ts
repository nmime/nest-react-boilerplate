import { adminApi, throwOnOpenApiErrorData } from "@app/api-client";
import { getRequiredApiBaseUrl, type FrontendEnv } from "@app/frontend-ui";

export type AdminPrincipal = Partial<adminApi.AuthenticatedPrincipalDto>;

export type AdminProfilePayload = Partial<
  Omit<adminApi.AdminProfilePayloadDto, "principal" | "profile">
> & {
  principal?: AdminPrincipal;
  profile?: Partial<adminApi.AdminProfilePayloadDto["profile"]>;
};

export interface AdminAccess {
  isAuthenticated: boolean;
  canReadDashboard: boolean;
  canReadProfile: boolean;
  roles: string[];
  permissions: string[];
}

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

export const createAdminAccess = (principal?: AdminPrincipal): AdminAccess => {
  const roles = normalizeClaimList(principal?.roles);
  const permissions = normalizeClaimList(principal?.permissions);
  const isAdmin = roles.includes("admin");
  const canReadDashboard =
    isAdmin && permissions.includes("admin:dashboard:read");
  const canReadProfile = isAdmin && permissions.includes("admin:profile:read");

  return {
    isAuthenticated: Boolean(principal?.subject),
    canReadDashboard,
    canReadProfile,
    roles,
    permissions,
  };
};

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
