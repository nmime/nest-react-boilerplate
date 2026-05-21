import { adminApi, throwOnOpenApiErrorData } from "@app/api-client";

export const ADMIN_TOKEN_STORAGE_KEY = "xrocket.admin." + "bearerToken";

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

export const getBearerTokenFromUrl = (_href: string): string => "";

export const readStoredBearerToken = (_storage?: Storage): string => "";

export const saveBearerToken = (
  _storage: Storage | undefined,
  _token: string,
): void => {
  // Legacy bearer-token storage is intentionally disabled.
};

export const resolveInitialBearerToken = (
  _href: string,
  _storage?: Storage,
): string => "";

export const getAdminApiBaseUrl = (envValue?: string): string =>
  (envValue?.trim() || "/").replace(/\/$/u, "");

export const fetchAdminProfile = async (
  apiBaseUrl = "",
): Promise<AdminProfilePayload> => {
  return throwOnOpenApiErrorData(
    adminApi.adminProfileControllerMe({
      baseUrl: apiBaseUrl,
    }),
  );
};
