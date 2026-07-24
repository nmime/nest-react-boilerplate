import { adminApi, throwOnOpenApiErrorData, type ApiClientRequestOptions } from '@app/frontend-api-client';
import {
  createAdminAccessPolicy,
  normalizeStringList,
  type AdminAccessPolicy,
  type AdminPrincipalClaims,
} from '@app/frontend-feature-admin-shared';
import { getRequiredApiBaseUrl, type FrontendEnv } from '@app/frontend-api-support';

export type AdminPrincipal = Partial<adminApi.AuthenticatedPrincipalDto>;

export type AdminProfilePayload = Partial<Omit<adminApi.AdminProfilePayloadDto, 'principal' | 'profile'>> & {
  principal?: AdminPrincipal;
  profile?: Partial<adminApi.AdminProfilePayloadDto['profile']>;
};

export type AdminAccess = AdminAccessPolicy;

// The canonical, fail-closed claim normalizer lives in @app/common-authz and is
// re-exported by admin-shared. Kept as a named export here because policy/route
// specs assert the normalizer directly.
export const normalizeClaimList = normalizeStringList;

// `createAdminAccessPolicy` already normalizes roles/permissions internally, so
// raw claim lists are passed straight through.
export const createAdminAccess = (principal?: AdminPrincipal): AdminAccess =>
  createAdminAccessPolicy({
    permissions: principal?.permissions,
    roles: principal?.roles,
    subject: principal?.subject,
  } satisfies AdminPrincipalClaims);

export const getAdminApiBaseUrl = (env: FrontendEnv): string => getRequiredApiBaseUrl(env, 'VITE_ADMIN_API_BASE_URL');

export const getAuthApiBaseUrl = (env: FrontendEnv): string => getRequiredApiBaseUrl(env, 'VITE_AUTH_API_BASE_URL');

const requireAdminProfilePayload = (payload: unknown): AdminProfilePayload => {
  if (payload === undefined) {
    throw new Error('Admin profile response was empty.');
  }

  return payload as AdminProfilePayload;
};

export const fetchAdminProfile = async (
  adminClient: Pick<typeof adminApi, 'adminProfileControllerMe'>,
  requestOptions?: ApiClientRequestOptions,
): Promise<AdminProfilePayload> => {
  return requireAdminProfilePayload(
    await throwOnOpenApiErrorData(adminClient.adminProfileControllerMe(requestOptions)),
  );
};
