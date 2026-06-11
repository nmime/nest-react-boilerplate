import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import createClient from "openapi-fetch";
import createQueryClient from "openapi-react-query";
import type { components, paths } from "../generated/admin";
import {
  type ApiClientRequestOptions,
  type ApiClientError,
  type EnvelopeData,
  type OpenApiData,
  type OpenApiError,
  throwOnOpenApiErrorData,
  toOpenApiFetchOptions,
} from "./service-options";

const ADMIN_HEALTH_PATH = "/health";
const ADMIN_LIVE_PATH = "/live";
const ADMIN_READY_PATH = "/ready";
const ADMIN_PROFILE_ME_PATH = "/admin/profile/me";
const ADMIN_USERS_PATH = "/admin/users";
const ADMIN_USER_PATH = "/admin/users/{id}";
const ADMIN_USER_STATUS_PATH = "/admin/users/{id}/status";
const ADMIN_USER_ACCESS_POLICY_PATH = "/admin/users/{id}/access-policy";
const ADMIN_ROLES_PATH = "/admin/roles";
const ADMIN_AUDIT_PATH = "/admin/audit";
const ADMIN_DASHBOARD_SUMMARY_PATH = "/admin/dashboard/summary";

export const client = createClient<paths>();
export const query = createQueryClient(client);

export type AuthenticatedPrincipalDto =
  components["schemas"]["AuthenticatedPrincipalDto"];
export type AdminProfileViewDto = components["schemas"]["AdminProfileViewDto"];
export type AdminProfilePayloadDto =
  components["schemas"]["AdminProfilePayloadDto"];
export type AdminUserViewDto = components["schemas"]["AdminUserViewDto"];
export type AdminUserListPayloadDto =
  components["schemas"]["AdminUserListPayloadDto"];
export type UpdateAdminUserStatusDto =
  components["schemas"]["UpdateAdminUserStatusDto"];
export type UpdateAdminUserAccessPolicyDto =
  components["schemas"]["UpdateAdminUserAccessPolicyDto"];
export type AdminRbacCatalogPayloadDto =
  components["schemas"]["AdminRbacCatalogPayloadDto"];
export type AdminAuditLogViewDto =
  components["schemas"]["AdminAuditLogViewDto"];
export type AdminAuditLogListPayloadDto =
  components["schemas"]["AdminAuditLogListPayloadDto"];
export type AdminDashboardSummaryDto =
  components["schemas"]["AdminDashboardSummaryDto"];

export const adminHealthControllerHealth = (
  options?: ApiClientRequestOptions,
) => client.GET(ADMIN_HEALTH_PATH, toOpenApiFetchOptions(options));
export const adminHealthControllerLive = (options?: ApiClientRequestOptions) =>
  client.GET(ADMIN_LIVE_PATH, toOpenApiFetchOptions(options));
export const adminHealthControllerReady = (options?: ApiClientRequestOptions) =>
  client.GET(ADMIN_READY_PATH, toOpenApiFetchOptions(options));
export type AdminUsersListQuery = NonNullable<
  paths[typeof ADMIN_USERS_PATH]["get"]["parameters"]["query"]
>;
export type AdminAuditListQuery = NonNullable<
  paths[typeof ADMIN_AUDIT_PATH]["get"]["parameters"]["query"]
>;

export const adminProfileControllerMe = (options?: ApiClientRequestOptions) =>
  client.GET(ADMIN_PROFILE_ME_PATH, toOpenApiFetchOptions(options));
export type AdminProfileControllerMeResponse = OpenApiData<
  typeof adminProfileControllerMe
>;
export type AdminProfileControllerMeData =
  EnvelopeData<AdminProfileControllerMeResponse>;
export type AdminProfileControllerMeError = OpenApiError<
  typeof adminProfileControllerMe
>;

export const adminUsersControllerListUsers = (
  params: AdminUsersListQuery = {},
  options?: ApiClientRequestOptions,
) =>
  client.GET(ADMIN_USERS_PATH, {
    ...toOpenApiFetchOptions(options),
    params: { query: params },
  });
export type AdminUsersControllerListUsersResponse = OpenApiData<
  typeof adminUsersControllerListUsers
>;
export type AdminUsersControllerListUsersData =
  EnvelopeData<AdminUsersControllerListUsersResponse>;
export type AdminUsersControllerListUsersError = OpenApiError<
  typeof adminUsersControllerListUsers
>;

export const adminUsersControllerGetUser = (
  id: string,
  options?: ApiClientRequestOptions,
) =>
  client.GET(ADMIN_USER_PATH, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
  });
export type AdminUsersControllerGetUserResponse = OpenApiData<
  typeof adminUsersControllerGetUser
>;
export type AdminUsersControllerGetUserData =
  EnvelopeData<AdminUsersControllerGetUserResponse>;
export type AdminUsersControllerGetUserError = OpenApiError<
  typeof adminUsersControllerGetUser
>;

export const adminUsersControllerUpdateUserStatus = (
  id: string,
  body: UpdateAdminUserStatusDto,
  options?: ApiClientRequestOptions,
) =>
  client.PATCH(ADMIN_USER_STATUS_PATH, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { path: { id } },
  });
export type AdminUsersControllerUpdateUserStatusResponse = OpenApiData<
  typeof adminUsersControllerUpdateUserStatus
>;
export type AdminUsersControllerUpdateUserStatusData =
  EnvelopeData<AdminUsersControllerUpdateUserStatusResponse>;
export type AdminUsersControllerUpdateUserStatusError = OpenApiError<
  typeof adminUsersControllerUpdateUserStatus
>;

export const adminUsersControllerUpdateUserAccessPolicy = (
  id: string,
  body: UpdateAdminUserAccessPolicyDto,
  options?: ApiClientRequestOptions,
) =>
  client.PATCH(ADMIN_USER_ACCESS_POLICY_PATH, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { path: { id } },
  });
export type AdminUsersControllerUpdateUserAccessPolicyResponse = OpenApiData<
  typeof adminUsersControllerUpdateUserAccessPolicy
>;
export type AdminUsersControllerUpdateUserAccessPolicyData =
  EnvelopeData<AdminUsersControllerUpdateUserAccessPolicyResponse>;
export type AdminUsersControllerUpdateUserAccessPolicyError = OpenApiError<
  typeof adminUsersControllerUpdateUserAccessPolicy
>;

export const adminUsersControllerRoles = (options?: ApiClientRequestOptions) =>
  client.GET(ADMIN_ROLES_PATH, toOpenApiFetchOptions(options));
export type AdminUsersControllerRolesResponse = OpenApiData<
  typeof adminUsersControllerRoles
>;
export type AdminUsersControllerRolesData =
  EnvelopeData<AdminUsersControllerRolesResponse>;
export type AdminUsersControllerRolesError = OpenApiError<
  typeof adminUsersControllerRoles
>;

export const adminUsersControllerListAudit = (
  params: AdminAuditListQuery = {},
  options?: ApiClientRequestOptions,
) =>
  client.GET(ADMIN_AUDIT_PATH, {
    ...toOpenApiFetchOptions(options),
    params: { query: params },
  });
export type AdminUsersControllerListAuditResponse = OpenApiData<
  typeof adminUsersControllerListAudit
>;
export type AdminUsersControllerListAuditData =
  EnvelopeData<AdminUsersControllerListAuditResponse>;
export type AdminUsersControllerListAuditError = OpenApiError<
  typeof adminUsersControllerListAudit
>;

export const adminUsersControllerDashboardSummary = (
  options?: ApiClientRequestOptions,
) => client.GET(ADMIN_DASHBOARD_SUMMARY_PATH, toOpenApiFetchOptions(options));
export type AdminUsersControllerDashboardSummaryResponse = OpenApiData<
  typeof adminUsersControllerDashboardSummary
>;
export type AdminUsersControllerDashboardSummaryData =
  EnvelopeData<AdminUsersControllerDashboardSummaryResponse>;
export type AdminUsersControllerDashboardSummaryError = OpenApiError<
  typeof adminUsersControllerDashboardSummary
>;

export const getAdminProfileControllerMeQueryKey = () =>
  ["get", ADMIN_PROFILE_ME_PATH] as const;
export const getAdminUsersControllerListUsersQueryKey = (
  params: AdminUsersListQuery = {},
) => ["get", ADMIN_USERS_PATH, params] as const;
export const getAdminUsersControllerGetUserQueryKey = (id: string) =>
  ["get", ADMIN_USER_PATH, id] as const;
export const getAdminUsersControllerRolesQueryKey = () =>
  ["get", ADMIN_ROLES_PATH] as const;
export const getAdminUsersControllerListAuditQueryKey = (
  params: AdminAuditListQuery = {},
) => ["get", ADMIN_AUDIT_PATH, params] as const;
export const getAdminUsersControllerDashboardSummaryQueryKey = () =>
  ["get", ADMIN_DASHBOARD_SUMMARY_PATH] as const;
export const getAdminUsersControllerUpdateUserStatusMutationKey = () =>
  ["patch", ADMIN_USER_STATUS_PATH] as const;
export const getAdminUsersControllerUpdateUserAccessPolicyMutationKey = () =>
  ["patch", ADMIN_USER_ACCESS_POLICY_PATH] as const;

export const getAdminProfileControllerMeQueryOptions = (
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<
  AdminProfileControllerMeResponse,
  AdminProfileControllerMeError
> =>
  query.queryOptions(
    "get",
    ADMIN_PROFILE_ME_PATH,
    toOpenApiFetchOptions(options),
  ) as unknown as OpenApiQueryOptions<
    AdminProfileControllerMeResponse,
    AdminProfileControllerMeError
  >;

export const getAdminUsersControllerListUsersQueryOptions = (
  params: AdminUsersListQuery = {},
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<
  AdminUsersControllerListUsersResponse,
  AdminUsersControllerListUsersError
> =>
  query.queryOptions("get", ADMIN_USERS_PATH, {
    ...toOpenApiFetchOptions(options),
    params: { query: params },
  }) as unknown as OpenApiQueryOptions<
    AdminUsersControllerListUsersResponse,
    AdminUsersControllerListUsersError
  >;

export const getAdminUsersControllerGetUserQueryOptions = (
  id: string,
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<
  AdminUsersControllerGetUserResponse,
  AdminUsersControllerGetUserError
> =>
  query.queryOptions("get", ADMIN_USER_PATH, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
  }) as unknown as OpenApiQueryOptions<
    AdminUsersControllerGetUserResponse,
    AdminUsersControllerGetUserError
  >;

type OpenApiQueryOptions<TData, TError> = Omit<
  UseQueryOptions<TData, TError, TData, readonly unknown[]>,
  "queryFn"
> & {
  queryFn: NonNullable<
    UseQueryOptions<TData, TError, TData, readonly unknown[]>["queryFn"]
  >;
};

type QueryConfig<TData, TError> = Omit<
  UseQueryOptions<TData, ApiClientError<TError>, TData, readonly unknown[]>,
  "queryFn" | "queryKey"
> & {
  request?: ApiClientRequestOptions;
};

type MutationConfig<TData, TError, TVariables, TContext = unknown> = Omit<
  UseMutationOptions<TData, ApiClientError<TError>, TVariables, TContext>,
  "mutationFn" | "mutationKey"
> & {
  request?: ApiClientRequestOptions;
};

export const useAdminProfileControllerMeQuery = ({
  request,
  ...options
}: QueryConfig<
  AdminProfileControllerMeData,
  AdminProfileControllerMeError
> = {}) =>
  useQuery({
    queryKey: [...getAdminProfileControllerMeQueryKey(), request] as const,
    queryFn: () => throwOnOpenApiErrorData(adminProfileControllerMe(request)),
    ...options,
  });

export const useAdminUsersControllerListUsersQuery = ({
  params = {},
  request,
  ...options
}: QueryConfig<
  AdminUsersControllerListUsersData,
  AdminUsersControllerListUsersError
> & { params?: AdminUsersListQuery } = {}) =>
  useQuery({
    queryKey: [
      ...getAdminUsersControllerListUsersQueryKey(params),
      request,
    ] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(adminUsersControllerListUsers(params, request)),
    ...options,
  });

export const useAdminUsersControllerGetUserQuery = ({
  id,
  request,
  ...options
}: QueryConfig<
  AdminUsersControllerGetUserData,
  AdminUsersControllerGetUserError
> & { id: string }) =>
  useQuery({
    queryKey: [...getAdminUsersControllerGetUserQueryKey(id), request] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(adminUsersControllerGetUser(id, request)),
    ...options,
  });

export const useAdminUsersControllerRolesQuery = ({
  request,
  ...options
}: QueryConfig<
  AdminUsersControllerRolesData,
  AdminUsersControllerRolesError
> = {}) =>
  useQuery({
    queryKey: [...getAdminUsersControllerRolesQueryKey(), request] as const,
    queryFn: () => throwOnOpenApiErrorData(adminUsersControllerRoles(request)),
    ...options,
  });

export const useAdminUsersControllerListAuditQuery = ({
  params = {},
  request,
  ...options
}: QueryConfig<
  AdminUsersControllerListAuditData,
  AdminUsersControllerListAuditError
> & { params?: AdminAuditListQuery } = {}) =>
  useQuery({
    queryKey: [
      ...getAdminUsersControllerListAuditQueryKey(params),
      request,
    ] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(adminUsersControllerListAudit(params, request)),
    ...options,
  });

export const useAdminUsersControllerDashboardSummaryQuery = ({
  request,
  ...options
}: QueryConfig<
  AdminUsersControllerDashboardSummaryData,
  AdminUsersControllerDashboardSummaryError
> = {}) =>
  useQuery({
    queryKey: [
      ...getAdminUsersControllerDashboardSummaryQueryKey(),
      request,
    ] as const,
    queryFn: () =>
      throwOnOpenApiErrorData(adminUsersControllerDashboardSummary(request)),
    ...options,
  });

export const useAdminUsersControllerUpdateUserStatusMutation = <
  TContext = unknown,
>({
  request,
  ...options
}: MutationConfig<
  AdminUsersControllerUpdateUserStatusData,
  AdminUsersControllerUpdateUserStatusError,
  { id: string; body: UpdateAdminUserStatusDto },
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAdminUsersControllerUpdateUserStatusMutationKey(),
    mutationFn: ({ id, body }) =>
      throwOnOpenApiErrorData(
        adminUsersControllerUpdateUserStatus(id, body, request),
      ),
    ...options,
  });

export const useAdminUsersControllerUpdateUserAccessPolicyMutation = <
  TContext = unknown,
>({
  request,
  ...options
}: MutationConfig<
  AdminUsersControllerUpdateUserAccessPolicyData,
  AdminUsersControllerUpdateUserAccessPolicyError,
  { id: string; body: UpdateAdminUserAccessPolicyDto },
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAdminUsersControllerUpdateUserAccessPolicyMutationKey(),
    mutationFn: ({ id, body }) =>
      throwOnOpenApiErrorData(
        adminUsersControllerUpdateUserAccessPolicy(id, body, request),
      ),
    ...options,
  });
