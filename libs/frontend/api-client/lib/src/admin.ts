import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import createClient from "openapi-fetch";
import createQueryClient from "openapi-react-query";
import type { components, paths } from "./generated/admin";
import {
  type ApiClientRequestOptions,
  type ApiClientError,
  type EnvelopeData,
  type OpenApiData,
  type OpenApiError,
  throwOnOpenApiErrorData,
  toOpenApiFetchOptions,
} from "./service-options";

const adminHealthPath = "/health";
const adminLivePath = "/live";
const adminReadyPath = "/ready";
const adminProfileMePath = "/admin/profile/me";
const adminUsersPath = "/admin/users";
const adminUserPath = "/admin/users/{id}";
const adminUserStatusPath = "/admin/users/{id}/status";
const adminUserAccessPolicyPath = "/admin/users/{id}/access-policy";
const adminRolesPath = "/admin/roles";
const adminAuditPath = "/admin/audit";
const adminDashboardSummaryPath = "/admin/dashboard/summary";

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
) => client.GET(adminHealthPath, toOpenApiFetchOptions(options));
export const adminHealthControllerLive = (options?: ApiClientRequestOptions) =>
  client.GET(adminLivePath, toOpenApiFetchOptions(options));
export const adminHealthControllerReady = (options?: ApiClientRequestOptions) =>
  client.GET(adminReadyPath, toOpenApiFetchOptions(options));
export type AdminUsersListQuery = NonNullable<
  paths[typeof adminUsersPath]["get"]["parameters"]["query"]
>;
export type AdminAuditListQuery = NonNullable<
  paths[typeof adminAuditPath]["get"]["parameters"]["query"]
>;

export const adminProfileControllerMe = (options?: ApiClientRequestOptions) =>
  client.GET(adminProfileMePath, toOpenApiFetchOptions(options));
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
  client.GET(adminUsersPath, {
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
  client.GET(adminUserPath, {
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
  client.PATCH(adminUserStatusPath, {
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
  client.PATCH(adminUserAccessPolicyPath, {
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
  client.GET(adminRolesPath, toOpenApiFetchOptions(options));
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
  client.GET(adminAuditPath, {
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
) => client.GET(adminDashboardSummaryPath, toOpenApiFetchOptions(options));
export type AdminUsersControllerDashboardSummaryResponse = OpenApiData<
  typeof adminUsersControllerDashboardSummary
>;
export type AdminUsersControllerDashboardSummaryData =
  EnvelopeData<AdminUsersControllerDashboardSummaryResponse>;
export type AdminUsersControllerDashboardSummaryError = OpenApiError<
  typeof adminUsersControllerDashboardSummary
>;

export const getAdminProfileControllerMeQueryKey = () =>
  ["get", adminProfileMePath] as const;
export const getAdminUsersControllerListUsersQueryKey = (
  params: AdminUsersListQuery = {},
) => ["get", adminUsersPath, params] as const;
export const getAdminUsersControllerGetUserQueryKey = (id: string) =>
  ["get", adminUserPath, id] as const;
export const getAdminUsersControllerRolesQueryKey = () =>
  ["get", adminRolesPath] as const;
export const getAdminUsersControllerListAuditQueryKey = (
  params: AdminAuditListQuery = {},
) => ["get", adminAuditPath, params] as const;
export const getAdminUsersControllerDashboardSummaryQueryKey = () =>
  ["get", adminDashboardSummaryPath] as const;
export const getAdminUsersControllerUpdateUserStatusMutationKey = () =>
  ["patch", adminUserStatusPath] as const;
export const getAdminUsersControllerUpdateUserAccessPolicyMutationKey = () =>
  ["patch", adminUserAccessPolicyPath] as const;

export const getAdminProfileControllerMeQueryOptions = (
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<
  AdminProfileControllerMeResponse,
  AdminProfileControllerMeError
> =>
  query.queryOptions(
    "get",
    adminProfileMePath,
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
  query.queryOptions("get", adminUsersPath, {
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
  query.queryOptions("get", adminUserPath, {
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
