import { useMutation, useQuery, type UseMutationOptions, type UseQueryOptions } from '@tanstack/react-query';
import createClient from 'openapi-fetch';
import createQueryClient from 'openapi-react-query';
import type { components, paths } from './generated/admin';
import {
  type ApiClientRequestOptions,
  type ApiClientError,
  type EnvelopeData,
  type OpenApiData,
  type OpenApiError,
  throwOnOpenApiErrorData,
  toOpenApiFetchOptions,
} from './service-options';

const adminHealthPath = '/admin/health';
const adminLivePath = '/admin/live';
const adminReadyPath = '/admin/ready';
const adminProfileMePath = '/admin/profile/me';
const adminUsersPath = '/admin/users';
const adminUserPath = '/admin/users/{id}';
const adminUserStatusPath = '/admin/users/{id}/status';
const adminUserAccessPolicyPath = '/admin/users/{id}/access-policy';
const adminRolesPath = '/admin/roles';
const adminRolePath = '/admin/roles/{id}';
const adminRolePermissionsPath = '/admin/roles/{id}/permissions';
const adminUserRolesPath = '/admin/users/{id}/roles';
const adminAuditPath = '/admin/audit';
const adminAuditMetaPath = '/admin/audit/meta';
const adminAuditEntryPath = '/admin/audit/{id}';
const adminAuthLoginAnalyticsPath = '/admin/auth/login-analytics';
const adminAuthLoginAnalyticsSummaryPath = '/admin/auth/login-analytics/summary';
const adminDashboardSummaryPath = '/admin/dashboard/summary';
const adminProblemPresentationsPath = '/admin/settings/problem-presentations';
const adminProblemPresentationResetPath = '/admin/settings/problem-presentations/reset';
const adminFeatureFlagsPath = '/admin/feature-flags';
const adminFeatureFlagPath = '/admin/feature-flags/{key}';
const adminNotificationTemplatesPath = '/admin/notification-templates';
const adminNotificationTemplatePath = '/admin/notification-templates/{id}';
const adminNotificationTemplatePublishPath = '/admin/notification-templates/{id}/publish';
const adminNotificationTemplateArchivePath = '/admin/notification-templates/{id}/archive';
const adminNotificationTemplatePreviewPath = '/admin/notification-templates/{id}/preview';
const adminNotificationTemplateTestSendPath = '/admin/notification-templates/{id}/test-send';
const adminNotificationResolversPath = '/admin/notification-segment-resolvers';
const adminNotificationSegmentsPath = '/admin/notification-segments';
const adminNotificationSegmentPath = '/admin/notification-segments/{id}';
const adminNotificationSegmentEstimatePath = '/admin/notification-segments/{id}/estimate';
const adminNotificationSegmentUploadsPath = '/admin/notification-segments/{id}/uploads';
const adminNotificationSegmentUploadPath = '/admin/notification-segment-uploads/{id}';
const adminNotificationSegmentArchivePath = '/admin/notification-segments/{id}/archive';
const adminNotificationBroadcastsPath = '/admin/notification-broadcasts';
const adminNotificationBroadcastPath = '/admin/notification-broadcasts/{id}';

export const client = createClient<paths>();
export const query = createQueryClient(client);

export type AuthenticatedPrincipalDto = components['schemas']['AuthenticatedPrincipalDto'];
export type AdminProfileViewDto = components['schemas']['AdminProfileViewDto'];
export type AdminProfilePayloadDto = components['schemas']['AdminProfilePayloadDto'];
export type AdminUserViewDto = components['schemas']['AdminUserViewDto'];
export type AdminUserListPayloadDto = components['schemas']['AdminUserListPayloadDto'];
export type UpdateAdminUserStatusDto = components['schemas']['UpdateAdminUserStatusDto'];
export type UpdateAdminUserAccessPolicyDto = components['schemas']['UpdateAdminUserAccessPolicyDto'];
export type AdminRbacCatalogPayloadDto = components['schemas']['AdminRbacCatalogPayloadDto'];
export type AdminRoleViewDto = components['schemas']['AdminRoleViewDto'];
export type CreateAdminRoleDto = components['schemas']['CreateAdminRoleDto'];
export type UpdateAdminRoleDto = components['schemas']['UpdateAdminRoleDto'];
export type SetAdminRolePermissionsDto = components['schemas']['SetAdminRolePermissionsDto'];
export type AssignAdminUserRolesDto = components['schemas']['AssignAdminUserRolesDto'];
export type AuditLogAdminViewDto = components['schemas']['AuditLogAdminViewDto'];
export type AuditLogAdminListPayloadDto = components['schemas']['AuditLogAdminListPayloadDto'];
export type AuditLogAdminMetadataDto = components['schemas']['AuditLogAdminMetadataDto'];
export type AuthLoginAnalyticsEventDto = components['schemas']['AuthLoginAnalyticsEventDto'];
export type AuthLoginAnalyticsListPayloadDto = components['schemas']['AuthLoginAnalyticsListPayloadDto'];
export type AuthLoginAnalyticsSummaryDto = components['schemas']['AuthLoginAnalyticsSummaryDto'];
export type AdminDashboardSummaryDto = components['schemas']['AdminDashboardSummaryDto'];
export type AdminProblemPresentationViewDto = components['schemas']['AdminProblemPresentationViewDto'];
export type AdminProblemPresentationCatalogDto = components['schemas']['AdminProblemPresentationCatalogDto'];
export type UpdateAdminProblemPresentationDto = components['schemas']['UpdateAdminProblemPresentationDto'];
export type ResetAdminProblemPresentationDto = components['schemas']['ResetAdminProblemPresentationDto'];
export type AdminFeatureFlagViewDto = components['schemas']['AdminFeatureFlagViewDto'];
export type AdminFeatureFlagListPayloadDto = components['schemas']['AdminFeatureFlagListPayloadDto'];
export type UpsertAdminFeatureFlagDto = components['schemas']['UpsertAdminFeatureFlagDto'];
export type AdminNotificationTemplateViewDto = components['schemas']['AdminNotificationTemplateViewDto'];
export type AdminNotificationTemplateChannelInputDto =
  components['schemas']['AdminNotificationTemplateChannelInputDto'];
export type CreateAdminNotificationTemplateDto = components['schemas']['CreateAdminNotificationTemplateDto'];
export type UpdateAdminNotificationTemplateDto = components['schemas']['UpdateAdminNotificationTemplateDto'];
export type PreviewAdminNotificationTemplateDto = components['schemas']['PreviewAdminNotificationTemplateDto'];
export type TestSendAdminNotificationTemplateDto = components['schemas']['TestSendAdminNotificationTemplateDto'];
export type AdminNotificationSegmentViewDto = components['schemas']['AdminNotificationSegmentViewDto'];
export type CreateAdminNotificationSegmentDto = components['schemas']['CreateAdminNotificationSegmentDto'];
export type UpdateAdminNotificationSegmentDto = components['schemas']['UpdateAdminNotificationSegmentDto'];
export type AdminNotificationSegmentUploadViewDto = components['schemas']['AdminNotificationSegmentUploadViewDto'];
export type UploadAdminNotificationSegmentCsvDto = components['schemas']['UploadAdminNotificationSegmentCsvDto'];
export type AdminNotificationBroadcastViewDto = components['schemas']['AdminNotificationBroadcastViewDto'];
export type CreateAdminNotificationBroadcastDto = components['schemas']['CreateAdminNotificationBroadcastDto'];
export type UpdateAdminNotificationBroadcastDto = components['schemas']['UpdateAdminNotificationBroadcastDto'];
export type ScheduleAdminNotificationBroadcastDto = components['schemas']['ScheduleAdminNotificationBroadcastDto'];

export const adminHealthControllerHealth = (options?: ApiClientRequestOptions) =>
  client.GET(adminHealthPath, toOpenApiFetchOptions(options));
export const adminHealthControllerLive = (options?: ApiClientRequestOptions) =>
  client.GET(adminLivePath, toOpenApiFetchOptions(options));
export const adminHealthControllerReady = (options?: ApiClientRequestOptions) =>
  client.GET(adminReadyPath, toOpenApiFetchOptions(options));
export type AdminUsersListQuery = NonNullable<paths[typeof adminUsersPath]['get']['parameters']['query']>;
export type AdminAuditListQuery = NonNullable<paths[typeof adminAuditPath]['get']['parameters']['query']>;
export type AdminAuthLoginAnalyticsQuery = NonNullable<
  paths[typeof adminAuthLoginAnalyticsPath]['get']['parameters']['query']
>;

export const adminProfileControllerMe = (options?: ApiClientRequestOptions) =>
  client.GET(adminProfileMePath, toOpenApiFetchOptions(options));
export type AdminProfileControllerMeResponse = OpenApiData<typeof adminProfileControllerMe>;
export type AdminProfileControllerMeData = EnvelopeData<AdminProfileControllerMeResponse>;
export type AdminProfileControllerMeError = OpenApiError<typeof adminProfileControllerMe>;

export const adminUsersControllerListUsers = (params: AdminUsersListQuery = {}, options?: ApiClientRequestOptions) =>
  client.GET(adminUsersPath, {
    ...toOpenApiFetchOptions(options),
    params: { query: params },
  });
export type AdminUsersControllerListUsersResponse = OpenApiData<typeof adminUsersControllerListUsers>;
export type AdminUsersControllerListUsersData = EnvelopeData<AdminUsersControllerListUsersResponse>;
export type AdminUsersControllerListUsersError = OpenApiError<typeof adminUsersControllerListUsers>;

export const adminUsersControllerGetUser = (id: string, options?: ApiClientRequestOptions) =>
  client.GET(adminUserPath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
  });
export type AdminUsersControllerGetUserResponse = OpenApiData<typeof adminUsersControllerGetUser>;
export type AdminUsersControllerGetUserData = EnvelopeData<AdminUsersControllerGetUserResponse>;
export type AdminUsersControllerGetUserError = OpenApiError<typeof adminUsersControllerGetUser>;

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
export type AdminUsersControllerUpdateUserStatusResponse = OpenApiData<typeof adminUsersControllerUpdateUserStatus>;
export type AdminUsersControllerUpdateUserStatusData = EnvelopeData<AdminUsersControllerUpdateUserStatusResponse>;
export type AdminUsersControllerUpdateUserStatusError = OpenApiError<typeof adminUsersControllerUpdateUserStatus>;

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
export type AdminUsersControllerRolesResponse = OpenApiData<typeof adminUsersControllerRoles>;
export type AdminUsersControllerRolesData = EnvelopeData<AdminUsersControllerRolesResponse>;
export type AdminUsersControllerRolesError = OpenApiError<typeof adminUsersControllerRoles>;

export const adminRolesControllerCreateRole = (body: CreateAdminRoleDto, options?: ApiClientRequestOptions) =>
  client.POST(adminRolesPath, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AdminRolesControllerCreateRoleResponse = OpenApiData<typeof adminRolesControllerCreateRole>;
export type AdminRolesControllerCreateRoleData = EnvelopeData<AdminRolesControllerCreateRoleResponse>;
export type AdminRolesControllerCreateRoleError = OpenApiError<typeof adminRolesControllerCreateRole>;

export const adminRolesControllerUpdateRole = (
  id: string,
  body: UpdateAdminRoleDto,
  options?: ApiClientRequestOptions,
) =>
  client.PATCH(adminRolePath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { path: { id } },
  });
export type AdminRolesControllerUpdateRoleResponse = OpenApiData<typeof adminRolesControllerUpdateRole>;
export type AdminRolesControllerUpdateRoleData = EnvelopeData<AdminRolesControllerUpdateRoleResponse>;
export type AdminRolesControllerUpdateRoleError = OpenApiError<typeof adminRolesControllerUpdateRole>;

export const adminRolesControllerSetRolePermissions = (
  id: string,
  body: SetAdminRolePermissionsDto,
  options?: ApiClientRequestOptions,
) =>
  client.PUT(adminRolePermissionsPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { path: { id } },
  });
export type AdminRolesControllerSetRolePermissionsResponse = OpenApiData<typeof adminRolesControllerSetRolePermissions>;
export type AdminRolesControllerSetRolePermissionsData = EnvelopeData<AdminRolesControllerSetRolePermissionsResponse>;
export type AdminRolesControllerSetRolePermissionsError = OpenApiError<typeof adminRolesControllerSetRolePermissions>;

export const adminRolesControllerAssignUserRoles = (
  id: string,
  body: AssignAdminUserRolesDto,
  options?: ApiClientRequestOptions,
) =>
  client.PUT(adminUserRolesPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { path: { id } },
  });
export type AdminRolesControllerAssignUserRolesResponse = OpenApiData<typeof adminRolesControllerAssignUserRoles>;
export type AdminRolesControllerAssignUserRolesData = EnvelopeData<AdminRolesControllerAssignUserRolesResponse>;
export type AdminRolesControllerAssignUserRolesError = OpenApiError<typeof adminRolesControllerAssignUserRoles>;

export const auditLogAdminControllerList = (params: AdminAuditListQuery = {}, options?: ApiClientRequestOptions) =>
  client.GET(adminAuditPath, {
    ...toOpenApiFetchOptions(options),
    params: { query: params },
  });
export type AuditLogAdminControllerListResponse = OpenApiData<typeof auditLogAdminControllerList>;
export type AuditLogAdminControllerListData = EnvelopeData<AuditLogAdminControllerListResponse>;
export type AuditLogAdminControllerListError = OpenApiError<typeof auditLogAdminControllerList>;

export const auditLogAdminControllerMetadata = (options?: ApiClientRequestOptions) =>
  client.GET(adminAuditMetaPath, toOpenApiFetchOptions(options));
export type AuditLogAdminControllerMetadataResponse = OpenApiData<typeof auditLogAdminControllerMetadata>;
export type AuditLogAdminControllerMetadataData = EnvelopeData<AuditLogAdminControllerMetadataResponse>;
export type AuditLogAdminControllerMetadataError = OpenApiError<typeof auditLogAdminControllerMetadata>;

export const auditLogAdminControllerGet = (id: string, options?: ApiClientRequestOptions) =>
  client.GET(adminAuditEntryPath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
  });
export type AuditLogAdminControllerGetResponse = OpenApiData<typeof auditLogAdminControllerGet>;
export type AuditLogAdminControllerGetData = EnvelopeData<AuditLogAdminControllerGetResponse>;
export type AuditLogAdminControllerGetError = OpenApiError<typeof auditLogAdminControllerGet>;

export const authLoginAnalyticsAdminControllerList = (
  params: AdminAuthLoginAnalyticsQuery = {},
  options?: ApiClientRequestOptions,
) =>
  client.GET(adminAuthLoginAnalyticsPath, {
    ...toOpenApiFetchOptions(options),
    params: { query: params },
  });
export type AuthLoginAnalyticsAdminControllerListResponse = OpenApiData<typeof authLoginAnalyticsAdminControllerList>;
export type AuthLoginAnalyticsAdminControllerListData = EnvelopeData<AuthLoginAnalyticsAdminControllerListResponse>;
export type AuthLoginAnalyticsAdminControllerListError = OpenApiError<typeof authLoginAnalyticsAdminControllerList>;

export const authLoginAnalyticsAdminControllerSummary = (
  params: AdminAuthLoginAnalyticsQuery = {},
  options?: ApiClientRequestOptions,
) =>
  client.GET(adminAuthLoginAnalyticsSummaryPath, {
    ...toOpenApiFetchOptions(options),
    params: { query: params },
  });
export type AuthLoginAnalyticsAdminControllerSummaryResponse = OpenApiData<
  typeof authLoginAnalyticsAdminControllerSummary
>;
export type AuthLoginAnalyticsAdminControllerSummaryData =
  EnvelopeData<AuthLoginAnalyticsAdminControllerSummaryResponse>;
export type AuthLoginAnalyticsAdminControllerSummaryError = OpenApiError<
  typeof authLoginAnalyticsAdminControllerSummary
>;

export const adminUsersControllerDashboardSummary = (options?: ApiClientRequestOptions) =>
  client.GET(adminDashboardSummaryPath, toOpenApiFetchOptions(options));
export type AdminUsersControllerDashboardSummaryResponse = OpenApiData<typeof adminUsersControllerDashboardSummary>;
export type AdminUsersControllerDashboardSummaryData = EnvelopeData<AdminUsersControllerDashboardSummaryResponse>;
export type AdminUsersControllerDashboardSummaryError = OpenApiError<typeof adminUsersControllerDashboardSummary>;

export const adminProblemPresentationsControllerList = (options?: ApiClientRequestOptions) =>
  client.GET(adminProblemPresentationsPath, toOpenApiFetchOptions(options));
export type AdminProblemPresentationsControllerListResponse = OpenApiData<
  typeof adminProblemPresentationsControllerList
>;
export type AdminProblemPresentationsControllerListData = EnvelopeData<AdminProblemPresentationsControllerListResponse>;
export type AdminProblemPresentationsControllerListError = OpenApiError<typeof adminProblemPresentationsControllerList>;

export const adminProblemPresentationsControllerUpdate = (
  body: UpdateAdminProblemPresentationDto,
  options?: ApiClientRequestOptions,
) =>
  client.PUT(adminProblemPresentationsPath, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AdminProblemPresentationsControllerUpdateResponse = OpenApiData<
  typeof adminProblemPresentationsControllerUpdate
>;
export type AdminProblemPresentationsControllerUpdateData =
  EnvelopeData<AdminProblemPresentationsControllerUpdateResponse>;
export type AdminProblemPresentationsControllerUpdateError = OpenApiError<
  typeof adminProblemPresentationsControllerUpdate
>;

export const adminProblemPresentationsControllerReset = (
  body: ResetAdminProblemPresentationDto,
  options?: ApiClientRequestOptions,
) =>
  client.PUT(adminProblemPresentationResetPath, {
    ...toOpenApiFetchOptions(options),
    body,
  });
export type AdminProblemPresentationsControllerResetResponse = OpenApiData<
  typeof adminProblemPresentationsControllerReset
>;
export type AdminProblemPresentationsControllerResetData =
  EnvelopeData<AdminProblemPresentationsControllerResetResponse>;
export type AdminProblemPresentationsControllerResetError = OpenApiError<
  typeof adminProblemPresentationsControllerReset
>;

export const adminFeatureFlagsControllerList = (options?: ApiClientRequestOptions) =>
  client.GET(adminFeatureFlagsPath, toOpenApiFetchOptions(options));
export type AdminFeatureFlagsControllerListResponse = OpenApiData<typeof adminFeatureFlagsControllerList>;
export type AdminFeatureFlagsControllerListData = EnvelopeData<AdminFeatureFlagsControllerListResponse>;
export type AdminFeatureFlagsControllerListError = OpenApiError<typeof adminFeatureFlagsControllerList>;

export const adminFeatureFlagsControllerUpsert = (
  key: string,
  body: UpsertAdminFeatureFlagDto,
  options?: ApiClientRequestOptions,
) =>
  client.PUT(adminFeatureFlagPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { path: { key } },
  });
export type AdminFeatureFlagsControllerUpsertResponse = OpenApiData<typeof adminFeatureFlagsControllerUpsert>;
export type AdminFeatureFlagsControllerUpsertData = EnvelopeData<AdminFeatureFlagsControllerUpsertResponse>;
export type AdminFeatureFlagsControllerUpsertError = OpenApiError<typeof adminFeatureFlagsControllerUpsert>;

export const adminNotificationsControllerListTemplates = (options?: ApiClientRequestOptions) =>
  client.GET(adminNotificationTemplatesPath, toOpenApiFetchOptions(options));
export const adminNotificationsControllerGetTemplate = (id: string, options?: ApiClientRequestOptions) =>
  client.GET(adminNotificationTemplatePath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
  });
export const adminNotificationsControllerCreateTemplate = (
  body: CreateAdminNotificationTemplateDto,
  options?: ApiClientRequestOptions,
) => client.POST(adminNotificationTemplatesPath, { ...toOpenApiFetchOptions(options), body });
export const adminNotificationsControllerUpdateTemplate = (
  id: string,
  body: UpdateAdminNotificationTemplateDto,
  options?: ApiClientRequestOptions,
) =>
  client.PATCH(adminNotificationTemplatePath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { path: { id } },
  });
export const adminNotificationsControllerPublishTemplate = (id: string, options?: ApiClientRequestOptions) =>
  client.POST(adminNotificationTemplatePublishPath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
  });
export const adminNotificationsControllerArchiveTemplate = (id: string, options?: ApiClientRequestOptions) =>
  client.POST(adminNotificationTemplateArchivePath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
  });
export const adminNotificationsControllerPreviewTemplate = (
  id: string,
  body: PreviewAdminNotificationTemplateDto,
  options?: ApiClientRequestOptions,
) =>
  client.POST(adminNotificationTemplatePreviewPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { path: { id } },
  });
export const adminNotificationsControllerTestSend = (
  id: string,
  body: TestSendAdminNotificationTemplateDto,
  options?: ApiClientRequestOptions,
) =>
  client.POST(adminNotificationTemplateTestSendPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { path: { id } },
  });

export const adminNotificationsControllerListResolvers = (options?: ApiClientRequestOptions) =>
  client.GET(adminNotificationResolversPath, toOpenApiFetchOptions(options));
export const adminNotificationsControllerListSegments = (options?: ApiClientRequestOptions) =>
  client.GET(adminNotificationSegmentsPath, toOpenApiFetchOptions(options));
export const adminNotificationsControllerGetSegment = (id: string, options?: ApiClientRequestOptions) =>
  client.GET(adminNotificationSegmentPath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
  });
export const adminNotificationsControllerCreateSegment = (
  body: CreateAdminNotificationSegmentDto,
  options?: ApiClientRequestOptions,
) => client.POST(adminNotificationSegmentsPath, { ...toOpenApiFetchOptions(options), body });
export const adminNotificationsControllerUpdateSegment = (
  id: string,
  body: UpdateAdminNotificationSegmentDto,
  options?: ApiClientRequestOptions,
) =>
  client.PATCH(adminNotificationSegmentPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { path: { id } },
  });
export const adminNotificationsControllerEstimateSegment = (id: string, options?: ApiClientRequestOptions) =>
  client.POST(adminNotificationSegmentEstimatePath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
  });
export const adminNotificationsControllerUploadSegment = (
  id: string,
  body: UploadAdminNotificationSegmentCsvDto,
  options?: ApiClientRequestOptions,
) =>
  client.POST(adminNotificationSegmentUploadsPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { path: { id } },
  });
export const adminNotificationsControllerGetSegmentUpload = (id: string, options?: ApiClientRequestOptions) =>
  client.GET(adminNotificationSegmentUploadPath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
  });
export const adminNotificationsControllerArchiveSegment = (id: string, options?: ApiClientRequestOptions) =>
  client.POST(adminNotificationSegmentArchivePath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
  });

export const adminNotificationsControllerListBroadcasts = (options?: ApiClientRequestOptions) =>
  client.GET(adminNotificationBroadcastsPath, toOpenApiFetchOptions(options));
export const adminNotificationsControllerGetBroadcast = (id: string, options?: ApiClientRequestOptions) =>
  client.GET(adminNotificationBroadcastPath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
  });
export const adminNotificationsControllerCreateBroadcast = (
  body: CreateAdminNotificationBroadcastDto,
  options?: ApiClientRequestOptions,
) => client.POST(adminNotificationBroadcastsPath, { ...toOpenApiFetchOptions(options), body });
export const adminNotificationsControllerUpdateBroadcast = (
  id: string,
  body: UpdateAdminNotificationBroadcastDto,
  options?: ApiClientRequestOptions,
) =>
  client.PATCH(adminNotificationBroadcastPath, {
    ...toOpenApiFetchOptions(options),
    body,
    params: { path: { id } },
  });

type NotificationBroadcastCommand = 'approve' | 'cancel' | 'collect-audience' | 'pause' | 'resume' | 'send';
const notificationBroadcastCommandPaths = {
  approve: '/admin/notification-broadcasts/{id}/approve',
  cancel: '/admin/notification-broadcasts/{id}/cancel',
  'collect-audience': '/admin/notification-broadcasts/{id}/collect-audience',
  pause: '/admin/notification-broadcasts/{id}/pause',
  resume: '/admin/notification-broadcasts/{id}/resume',
  send: '/admin/notification-broadcasts/{id}/send',
} as const satisfies Record<NotificationBroadcastCommand, keyof paths>;

export const adminNotificationsControllerBroadcastCommand = (
  id: string,
  command: NotificationBroadcastCommand,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST(notificationBroadcastCommandPaths[command], {
    ...toOpenApiFetchOptions(options),
    params: { header: { 'idempotency-key': idempotencyKey }, path: { id } },
  });

export const adminNotificationsControllerScheduleBroadcast = (
  id: string,
  body: ScheduleAdminNotificationBroadcastDto,
  idempotencyKey: string,
  options?: ApiClientRequestOptions,
) =>
  client.POST('/admin/notification-broadcasts/{id}/schedule', {
    ...toOpenApiFetchOptions(options),
    body,
    params: { header: { 'idempotency-key': idempotencyKey }, path: { id } },
  });

export const getAdminProfileControllerMeQueryKey = () => ['get', adminProfileMePath] as const;
export const getAdminUsersControllerListUsersQueryKey = (params: AdminUsersListQuery = {}) =>
  ['get', adminUsersPath, params] as const;
export const getAdminUsersControllerGetUserQueryKey = (id: string) => ['get', adminUserPath, id] as const;
export const getAdminUsersControllerRolesQueryKey = () => ['get', adminRolesPath] as const;
export const getAuditLogAdminControllerListQueryKey = (params: AdminAuditListQuery = {}) =>
  ['get', adminAuditPath, params] as const;
export const getAuditLogAdminControllerMetadataQueryKey = () => ['get', adminAuditMetaPath] as const;
export const getAuditLogAdminControllerGetQueryKey = (id: string) => ['get', adminAuditEntryPath, id] as const;
export const getAuthLoginAnalyticsAdminControllerListQueryKey = (params: AdminAuthLoginAnalyticsQuery = {}) =>
  ['get', adminAuthLoginAnalyticsPath, params] as const;
export const getAuthLoginAnalyticsAdminControllerSummaryQueryKey = (params: AdminAuthLoginAnalyticsQuery = {}) =>
  ['get', adminAuthLoginAnalyticsSummaryPath, params] as const;
export const getAdminUsersControllerDashboardSummaryQueryKey = () => ['get', adminDashboardSummaryPath] as const;
export const getAdminProblemPresentationsControllerListQueryKey = () => ['get', adminProblemPresentationsPath] as const;
export const getAdminFeatureFlagsControllerListQueryKey = () => ['get', adminFeatureFlagsPath] as const;
export const getAdminNotificationTemplatesQueryKey = () => ['get', adminNotificationTemplatesPath] as const;
export const getAdminNotificationSegmentsQueryKey = () => ['get', adminNotificationSegmentsPath] as const;
export const getAdminNotificationResolversQueryKey = () => ['get', adminNotificationResolversPath] as const;
export const getAdminNotificationBroadcastsQueryKey = () => ['get', adminNotificationBroadcastsPath] as const;
export const getAdminUsersControllerUpdateUserStatusMutationKey = () => ['patch', adminUserStatusPath] as const;
export const getAdminUsersControllerUpdateUserAccessPolicyMutationKey = () =>
  ['patch', adminUserAccessPolicyPath] as const;
export const getAdminRolesControllerCreateRoleMutationKey = () => ['post', adminRolesPath] as const;
export const getAdminRolesControllerUpdateRoleMutationKey = () => ['patch', adminRolePath] as const;
export const getAdminRolesControllerSetRolePermissionsMutationKey = () => ['put', adminRolePermissionsPath] as const;
export const getAdminRolesControllerAssignUserRolesMutationKey = () => ['put', adminUserRolesPath] as const;
export const getAdminProblemPresentationsControllerUpdateMutationKey = () =>
  ['put', adminProblemPresentationsPath] as const;
export const getAdminProblemPresentationsControllerResetMutationKey = () =>
  ['put', adminProblemPresentationResetPath] as const;
export const getAdminFeatureFlagsControllerUpsertMutationKey = () => ['put', adminFeatureFlagPath] as const;

export const getAdminProfileControllerMeQueryOptions = (
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<AdminProfileControllerMeResponse, AdminProfileControllerMeError> =>
  query.queryOptions('get', adminProfileMePath, toOpenApiFetchOptions(options)) as unknown as OpenApiQueryOptions<
    AdminProfileControllerMeResponse,
    AdminProfileControllerMeError
  >;

export const getAdminUsersControllerListUsersQueryOptions = (
  params: AdminUsersListQuery = {},
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<AdminUsersControllerListUsersResponse, AdminUsersControllerListUsersError> =>
  query.queryOptions('get', adminUsersPath, {
    ...toOpenApiFetchOptions(options),
    params: { query: params },
  }) as unknown as OpenApiQueryOptions<AdminUsersControllerListUsersResponse, AdminUsersControllerListUsersError>;

export const getAdminUsersControllerGetUserQueryOptions = (
  id: string,
  options?: ApiClientRequestOptions,
): OpenApiQueryOptions<AdminUsersControllerGetUserResponse, AdminUsersControllerGetUserError> =>
  query.queryOptions('get', adminUserPath, {
    ...toOpenApiFetchOptions(options),
    params: { path: { id } },
  }) as unknown as OpenApiQueryOptions<AdminUsersControllerGetUserResponse, AdminUsersControllerGetUserError>;

type OpenApiQueryOptions<TData, TError> = Omit<UseQueryOptions<TData, TError, TData>, 'queryFn'> & {
  queryFn: NonNullable<UseQueryOptions<TData, TError, TData>['queryFn']>;
};

type QueryConfig<TData, TError> = Omit<
  UseQueryOptions<TData, ApiClientError<TError>, TData>,
  'queryFn' | 'queryKey'
> & {
  request?: ApiClientRequestOptions;
};

type MutationConfig<TData, TError, TVariables, TContext = unknown> = Omit<
  UseMutationOptions<TData, ApiClientError<TError>, TVariables, TContext>,
  'mutationFn' | 'mutationKey'
> & {
  request?: ApiClientRequestOptions;
};

export const useAdminProfileControllerMeQuery = ({
  request,
  ...options
}: QueryConfig<AdminProfileControllerMeData, AdminProfileControllerMeError> = {}) =>
  useQuery({
    queryKey: [...getAdminProfileControllerMeQueryKey(), request] as const,
    queryFn: () => throwOnOpenApiErrorData(adminProfileControllerMe(request)),
    ...options,
  });

export const useAdminUsersControllerListUsersQuery = ({
  params = {},
  request,
  ...options
}: QueryConfig<AdminUsersControllerListUsersData, AdminUsersControllerListUsersError> & {
  params?: AdminUsersListQuery;
} = {}) =>
  useQuery({
    queryKey: [...getAdminUsersControllerListUsersQueryKey(params), request] as const,
    queryFn: () => throwOnOpenApiErrorData(adminUsersControllerListUsers(params, request)),
    ...options,
  });

export const useAdminUsersControllerGetUserQuery = ({
  id,
  request,
  ...options
}: QueryConfig<AdminUsersControllerGetUserData, AdminUsersControllerGetUserError> & { id: string }) =>
  useQuery({
    queryKey: [...getAdminUsersControllerGetUserQueryKey(id), request] as const,
    queryFn: () => throwOnOpenApiErrorData(adminUsersControllerGetUser(id, request)),
    ...options,
  });

export const useAdminUsersControllerRolesQuery = ({
  request,
  ...options
}: QueryConfig<AdminUsersControllerRolesData, AdminUsersControllerRolesError> = {}) =>
  useQuery({
    queryKey: [...getAdminUsersControllerRolesQueryKey(), request] as const,
    queryFn: () => throwOnOpenApiErrorData(adminUsersControllerRoles(request)),
    ...options,
  });

export const useAuditLogAdminControllerListQuery = ({
  params = {},
  request,
  ...options
}: QueryConfig<AuditLogAdminControllerListData, AuditLogAdminControllerListError> & {
  params?: AdminAuditListQuery;
} = {}) =>
  useQuery({
    queryKey: [...getAuditLogAdminControllerListQueryKey(params), request] as const,
    queryFn: () => throwOnOpenApiErrorData(auditLogAdminControllerList(params, request)),
    ...options,
  });

export const useAuthLoginAnalyticsAdminControllerListQuery = ({
  params = {},
  request,
  ...options
}: QueryConfig<AuthLoginAnalyticsAdminControllerListData, AuthLoginAnalyticsAdminControllerListError> & {
  params?: AdminAuthLoginAnalyticsQuery;
} = {}) =>
  useQuery({
    queryKey: [...getAuthLoginAnalyticsAdminControllerListQueryKey(params), request] as const,
    queryFn: () => throwOnOpenApiErrorData(authLoginAnalyticsAdminControllerList(params, request)),
    ...options,
  });

export const useAuthLoginAnalyticsAdminControllerSummaryQuery = ({
  params = {},
  request,
  ...options
}: QueryConfig<AuthLoginAnalyticsAdminControllerSummaryData, AuthLoginAnalyticsAdminControllerSummaryError> & {
  params?: AdminAuthLoginAnalyticsQuery;
} = {}) =>
  useQuery({
    queryKey: [...getAuthLoginAnalyticsAdminControllerSummaryQueryKey(params), request] as const,
    queryFn: () => throwOnOpenApiErrorData(authLoginAnalyticsAdminControllerSummary(params, request)),
    ...options,
  });

export const useAdminUsersControllerDashboardSummaryQuery = ({
  request,
  ...options
}: QueryConfig<AdminUsersControllerDashboardSummaryData, AdminUsersControllerDashboardSummaryError> = {}) =>
  useQuery({
    queryKey: [...getAdminUsersControllerDashboardSummaryQueryKey(), request] as const,
    queryFn: () => throwOnOpenApiErrorData(adminUsersControllerDashboardSummary(request)),
    ...options,
  });

export const useAdminUsersControllerUpdateUserStatusMutation = <TContext = unknown>({
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
    mutationFn: ({ id, body }) => throwOnOpenApiErrorData(adminUsersControllerUpdateUserStatus(id, body, request)),
    ...options,
  });

export const useAdminUsersControllerUpdateUserAccessPolicyMutation = <TContext = unknown>({
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
      throwOnOpenApiErrorData(adminUsersControllerUpdateUserAccessPolicy(id, body, request)),
    ...options,
  });

export const useAdminRolesControllerCreateRoleMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AdminRolesControllerCreateRoleData,
  AdminRolesControllerCreateRoleError,
  { body: CreateAdminRoleDto },
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAdminRolesControllerCreateRoleMutationKey(),
    mutationFn: ({ body }) => throwOnOpenApiErrorData(adminRolesControllerCreateRole(body, request)),
    ...options,
  });

export const useAdminRolesControllerUpdateRoleMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AdminRolesControllerUpdateRoleData,
  AdminRolesControllerUpdateRoleError,
  { id: string; body: UpdateAdminRoleDto },
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAdminRolesControllerUpdateRoleMutationKey(),
    mutationFn: ({ id, body }) => throwOnOpenApiErrorData(adminRolesControllerUpdateRole(id, body, request)),
    ...options,
  });

export const useAdminRolesControllerSetRolePermissionsMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AdminRolesControllerSetRolePermissionsData,
  AdminRolesControllerSetRolePermissionsError,
  { id: string; body: SetAdminRolePermissionsDto },
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAdminRolesControllerSetRolePermissionsMutationKey(),
    mutationFn: ({ id, body }) => throwOnOpenApiErrorData(adminRolesControllerSetRolePermissions(id, body, request)),
    ...options,
  });

export const useAdminRolesControllerAssignUserRolesMutation = <TContext = unknown>({
  request,
  ...options
}: MutationConfig<
  AdminRolesControllerAssignUserRolesData,
  AdminRolesControllerAssignUserRolesError,
  { id: string; body: AssignAdminUserRolesDto },
  TContext
> = {}) =>
  useMutation({
    mutationKey: getAdminRolesControllerAssignUserRolesMutationKey(),
    mutationFn: ({ id, body }) => throwOnOpenApiErrorData(adminRolesControllerAssignUserRoles(id, body, request)),
    ...options,
  });
