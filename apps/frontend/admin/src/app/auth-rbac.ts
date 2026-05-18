import { adminApi, throwOnOpenApiErrorData } from "@app/api-client";

export const ADMIN_TOKEN_STORAGE_KEY = "xrocket.admin.bearerToken";

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

export const getBearerTokenFromUrl = (href: string): string => {
  const url = new URL(href, "http://localhost/");
  return (url.searchParams.get("admin_token") ?? "").trim();
};

export const readStoredBearerToken = (storage?: Storage): string =>
  storage?.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim() ?? "";

export const saveBearerToken = (
  storage: Storage | undefined,
  token: string,
): void => {
  const trimmed = token.trim();
  if (trimmed.length > 0) {
    storage?.setItem(ADMIN_TOKEN_STORAGE_KEY, trimmed);
  } else {
    storage?.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  }
};

export const resolveInitialBearerToken = (
  href: string,
  storage?: Storage,
): string => getBearerTokenFromUrl(href) || readStoredBearerToken(storage);

export const getAdminApiBaseUrl = (envValue?: string): string =>
  (envValue?.trim() || "/").replace(/\/$/u, "");

export const fetchAdminProfile = async (
  token: string,
  apiBaseUrl = "",
): Promise<AdminProfilePayload> => {
  return throwOnOpenApiErrorData(
    adminApi.adminProfileControllerMe({
      authToken: token,
      baseUrl: apiBaseUrl,
    }),
  );
};
