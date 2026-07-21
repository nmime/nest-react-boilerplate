import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { createOkResponse, type OkResponse } from '@app/backend-common-response';
import { ApiExceptions, ApiOkDataResponse, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import {
  CurrentUser,
  RequirePermissions,
  RequireRoles,
  type AuthenticatedPrincipal,
} from '@app/backend-feature-auth-shared';
import {
  AdminNotificationBroadcastsApprovePermission,
  AdminNotificationBroadcastsReadPermission,
  AdminNotificationBroadcastsSendPermission,
  AdminNotificationBroadcastsWritePermission,
  AdminNotificationSegmentsReadPermission,
  AdminNotificationSegmentsWritePermission,
  AdminNotificationTemplatesReadPermission,
  AdminNotificationTemplatesTestPermission,
  AdminNotificationTemplatesWritePermission,
  AdminRbacGuard,
  AdminRole,
} from '@app/backend-feature-admin-shared';
import { AuditLogAdminPersistenceError, AuditLogAdminService } from '@app/backend-feature-audit-log-admin';
import {
  NotificationAdminServiceInjectToken,
  type NotificationBroadcastPersistence,
  type NotificationSegmentResolverMetadata,
} from '@app/backend-feature-notification-shared';
import type {
  NotificationData,
  NotificationDeliveryChannel,
  NotificationDeliveryProvider,
  NotificationRecord,
  NotificationSegmentRecord,
  NotificationSegmentUploadRecord,
  NotificationTargetType,
  NotificationVariablesSchema,
} from '@app/common-notifications';
import {
  AdminNotificationArchivedQueryDto,
  AdminNotificationBroadcastListDto,
  AdminNotificationBroadcastQueryDto,
  AdminNotificationBroadcastViewDto,
  AdminNotificationEstimateDto,
  AdminNotificationPreviewDto,
  AdminNotificationResolverListDto,
  AdminNotificationSegmentListDto,
  AdminNotificationSegmentUploadViewDto,
  AdminNotificationSegmentViewDto,
  AdminNotificationTemplateListDto,
  AdminNotificationTemplateViewDto,
  CreateAdminNotificationBroadcastDto,
  CreateAdminNotificationSegmentDto,
  CreateAdminNotificationTemplateDto,
  PreviewAdminNotificationTemplateDto,
  ScheduleAdminNotificationBroadcastDto,
  TestSendAdminNotificationTemplateDto,
  UpdateAdminNotificationBroadcastDto,
  UpdateAdminNotificationSegmentDto,
  UpdateAdminNotificationTemplateDto,
  UploadAdminNotificationSegmentCsvDto,
} from './admin-notifications.dto';

@ApiExceptions(400, 401, 403, 404, 409, 429, 500)
@ApiBearerAuth()
@ApiSessionCookieAuth()
@UseGuards(new AdminRbacGuard())
@RequireRoles(AdminRole)
@Controller('admin')
export class AdminNotificationsController {
  constructor(
    @Inject(NotificationAdminServiceInjectToken)
    private readonly notifications: NotificationAdminOperations,
    private readonly auditLogs: AuditLogAdminService,
  ) {}

  @Get('notification-templates')
  @ApiOkDataResponse(AdminNotificationTemplateListDto)
  @RequirePermissions(AdminNotificationTemplatesReadPermission)
  async listTemplates(@CurrentUser() principal: AuthenticatedPrincipal): Promise<OkResponse<{ items: unknown[] }>> {
    return createOkResponse({ items: await this.notifications.listTemplates(principal.tenantId) });
  }

  @Post('notification-templates')
  @ApiOkDataResponse(AdminNotificationTemplateViewDto)
  @RequirePermissions(AdminNotificationTemplatesWritePermission)
  async createTemplate(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: CreateAdminNotificationTemplateDto,
  ) {
    return createOkResponse(
      await this.mutate(principal, 'admin.notification_template.create', 'admin.notification-templates', () =>
        this.notifications.createTemplate({
          ...input,
          tenantId: principal.tenantId,
          actorId: principal.subject,
          variablesSchema: input.variablesSchema as NotificationVariablesSchema | undefined,
          channels: input.channels as never,
        }),
      ),
    );
  }

  @Get('notification-templates/:id')
  @ApiOkDataResponse(AdminNotificationTemplateViewDto)
  @RequirePermissions(AdminNotificationTemplatesReadPermission)
  async getTemplate(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    return createOkResponse(this.requireFound(await this.notifications.getTemplate(id, principal.tenantId)));
  }

  @Patch('notification-templates/:id')
  @ApiOkDataResponse(AdminNotificationTemplateViewDto)
  @RequirePermissions(AdminNotificationTemplatesWritePermission)
  async updateTemplate(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: UpdateAdminNotificationTemplateDto,
  ) {
    const result = await this.mutate(
      principal,
      'admin.notification_template.update',
      `admin.notification-templates:${id}`,
      () =>
        this.notifications.updateTemplate(id, principal.tenantId, {
          ...input,
          actorId: principal.subject,
          variablesSchema: input.variablesSchema as NotificationVariablesSchema | undefined,
          channels: input.channels as never,
          expectedUpdatedAt: input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : undefined,
        }),
    );
    return createOkResponse(this.requireFound(result));
  }

  @Post('notification-templates/:id/publish')
  @ApiOkDataResponse(AdminNotificationTemplateViewDto)
  @RequirePermissions(AdminNotificationTemplatesWritePermission)
  publishTemplate(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    return this.templateCommand(principal, id, 'publish');
  }

  @Post('notification-templates/:id/archive')
  @ApiOkDataResponse(AdminNotificationTemplateViewDto)
  @RequirePermissions(AdminNotificationTemplatesWritePermission)
  archiveTemplate(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    return this.templateCommand(principal, id, 'archive');
  }

  @Post('notification-templates/:id/preview')
  @ApiOkDataResponse(AdminNotificationPreviewDto)
  @RequirePermissions(AdminNotificationTemplatesReadPermission)
  async previewTemplate(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: PreviewAdminNotificationTemplateDto,
  ) {
    return createOkResponse({
      message: await this.execute(() =>
        this.notifications.previewTemplate(
          id,
          principal.tenantId,
          input.channel,
          input.language,
          input.variables as NotificationData,
        ),
      ),
    });
  }

  @Post('notification-templates/:id/test-send')
  @ApiOkDataResponse(AdminNotificationPreviewDto)
  @RequirePermissions(AdminNotificationTemplatesTestPermission)
  async testSend(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: TestSendAdminNotificationTemplateDto,
  ) {
    const notification = await this.mutate(
      principal,
      'admin.notification_template.test_send',
      `admin.notification-templates:${id}`,
      () =>
        this.notifications.testSend({
          id,
          tenantId: principal.tenantId,
          targetType: input.targetType,
          targetId: input.targetId,
          channel: input.channel,
          provider: input.provider,
          language: input.language,
          variables: input.variables as NotificationData,
        }),
    );
    return createOkResponse({ message: { notificationId: notification.id } });
  }

  @Get('notification-segment-resolvers')
  @ApiOkDataResponse(AdminNotificationResolverListDto)
  @RequirePermissions(AdminNotificationSegmentsReadPermission)
  listResolvers() {
    return createOkResponse({ items: this.notifications.listResolvers() });
  }

  @Get('notification-segments')
  @ApiOkDataResponse(AdminNotificationSegmentListDto)
  @RequirePermissions(AdminNotificationSegmentsReadPermission)
  async listSegments(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: AdminNotificationArchivedQueryDto,
  ) {
    return createOkResponse({
      items: await this.notifications.listSegments(principal.tenantId, query.includeArchived),
    });
  }

  @Post('notification-segments')
  @ApiOkDataResponse(AdminNotificationSegmentViewDto)
  @RequirePermissions(AdminNotificationSegmentsWritePermission)
  async createSegment(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: CreateAdminNotificationSegmentDto,
  ) {
    return createOkResponse(
      await this.mutate(principal, 'admin.notification_segment.create', 'admin.notification-segments', () =>
        this.notifications.createSegment({
          ...input,
          tenantId: principal.tenantId,
          actorId: principal.subject,
          parameters: input.parameters as NotificationData | undefined,
        }),
      ),
    );
  }

  @Get('notification-segments/:id')
  @ApiOkDataResponse(AdminNotificationSegmentViewDto)
  @RequirePermissions(AdminNotificationSegmentsReadPermission)
  async getSegment(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    return createOkResponse(this.requireFound(await this.notifications.getSegment(id, principal.tenantId)));
  }

  @Patch('notification-segments/:id')
  @ApiOkDataResponse(AdminNotificationSegmentViewDto)
  @RequirePermissions(AdminNotificationSegmentsWritePermission)
  async updateSegment(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: UpdateAdminNotificationSegmentDto,
  ) {
    const result = await this.mutate(
      principal,
      'admin.notification_segment.update',
      `admin.notification-segments:${id}`,
      () =>
        this.notifications.updateSegment(id, principal.tenantId, {
          ...input,
          actorId: principal.subject,
          parameters: input.parameters as NotificationData | undefined,
        }),
    );
    return createOkResponse(this.requireFound(result));
  }

  @Post('notification-segments/:id/estimate')
  @ApiOkDataResponse(AdminNotificationEstimateDto)
  @RequirePermissions(AdminNotificationSegmentsReadPermission)
  estimateSegment(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    return this.execute(() => this.notifications.estimateSegment(id, principal.tenantId)).then(createOkResponse);
  }

  @Post('notification-segments/:id/uploads')
  @ApiOkDataResponse(AdminNotificationSegmentUploadViewDto)
  @RequirePermissions(AdminNotificationSegmentsWritePermission)
  async uploadSegment(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: UploadAdminNotificationSegmentCsvDto,
  ) {
    return createOkResponse(
      await this.mutate(principal, 'admin.notification_segment.upload', `admin.notification-segments:${id}`, () =>
        this.notifications.uploadSegmentCsv({
          id,
          tenantId: principal.tenantId,
          actorId: principal.subject,
          ...input,
        }),
      ),
    );
  }

  @Get('notification-segment-uploads/:id')
  @ApiOkDataResponse(AdminNotificationSegmentUploadViewDto)
  @RequirePermissions(AdminNotificationSegmentsReadPermission)
  async getSegmentUpload(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    return createOkResponse(this.requireFound(await this.notifications.getSegmentUpload(id, principal.tenantId)));
  }

  @Post('notification-segments/:id/archive')
  @ApiOkDataResponse(AdminNotificationSegmentViewDto)
  @RequirePermissions(AdminNotificationSegmentsWritePermission)
  async archiveSegment(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    const result = await this.mutate(
      principal,
      'admin.notification_segment.archive',
      `admin.notification-segments:${id}`,
      () => this.notifications.archiveSegment(id, principal.tenantId, principal.subject),
    );
    return createOkResponse(this.requireFound(result));
  }

  @Get('notification-broadcasts')
  @ApiOkDataResponse(AdminNotificationBroadcastListDto)
  @RequirePermissions(AdminNotificationBroadcastsReadPermission)
  async listBroadcasts(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query() query: AdminNotificationBroadcastQueryDto,
  ) {
    return createOkResponse({ items: await this.notifications.listBroadcasts(principal.tenantId, query.status) });
  }

  @Post('notification-broadcasts')
  @ApiOkDataResponse(AdminNotificationBroadcastViewDto)
  @RequirePermissions(AdminNotificationBroadcastsWritePermission)
  async createBroadcast(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: CreateAdminNotificationBroadcastDto,
  ) {
    return createOkResponse(
      await this.mutate(principal, 'admin.notification_broadcast.create', 'admin.notification-broadcasts', () =>
        this.notifications.createBroadcast({
          ...input,
          tenantId: principal.tenantId,
          actorId: principal.subject,
          globalVariables: input.globalVariables as NotificationData | undefined,
        }),
      ),
    );
  }

  @Get('notification-broadcasts/:id')
  @ApiOkDataResponse(AdminNotificationBroadcastViewDto)
  @RequirePermissions(AdminNotificationBroadcastsReadPermission)
  async getBroadcast(@CurrentUser() principal: AuthenticatedPrincipal, @Param('id') id: string) {
    return createOkResponse(this.requireFound(await this.notifications.getBroadcast(id, principal.tenantId)));
  }

  @Patch('notification-broadcasts/:id')
  @ApiOkDataResponse(AdminNotificationBroadcastViewDto)
  @RequirePermissions(AdminNotificationBroadcastsWritePermission)
  async updateBroadcast(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Body() input: UpdateAdminNotificationBroadcastDto,
  ) {
    const result = await this.mutate(
      principal,
      'admin.notification_broadcast.update',
      `admin.notification-broadcasts:${id}`,
      () =>
        this.notifications.updateBroadcast(id, principal.tenantId, {
          ...input,
          globalVariables: input.globalVariables as NotificationData | undefined,
        }),
    );
    return createOkResponse(this.requireFound(result));
  }

  @Post('notification-broadcasts/:id/collect-audience')
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOkDataResponse(AdminNotificationBroadcastViewDto)
  @RequirePermissions(AdminNotificationBroadcastsWritePermission)
  collectAudience(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.broadcastCommand(principal, id, 'collect-audience', key);
  }

  @Post('notification-broadcasts/:id/approve')
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOkDataResponse(AdminNotificationBroadcastViewDto)
  @RequirePermissions(AdminNotificationBroadcastsApprovePermission)
  approveBroadcast(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.broadcastCommand(principal, id, 'approve', key);
  }

  @Post('notification-broadcasts/:id/send')
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOkDataResponse(AdminNotificationBroadcastViewDto)
  @RequirePermissions(AdminNotificationBroadcastsSendPermission)
  sendBroadcast(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.broadcastCommand(principal, id, 'send', key);
  }

  @Post('notification-broadcasts/:id/schedule')
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOkDataResponse(AdminNotificationBroadcastViewDto)
  @RequirePermissions(AdminNotificationBroadcastsSendPermission)
  scheduleBroadcast(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ScheduleAdminNotificationBroadcastDto,
  ) {
    return this.broadcastCommand(principal, id, 'schedule', key, new Date(input.scheduledAt));
  }

  @Post('notification-broadcasts/:id/pause')
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOkDataResponse(AdminNotificationBroadcastViewDto)
  @RequirePermissions(AdminNotificationBroadcastsSendPermission)
  pauseBroadcast(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.broadcastCommand(principal, id, 'pause', key);
  }

  @Post('notification-broadcasts/:id/resume')
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOkDataResponse(AdminNotificationBroadcastViewDto)
  @RequirePermissions(AdminNotificationBroadcastsSendPermission)
  resumeBroadcast(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.broadcastCommand(principal, id, 'resume', key);
  }

  @Post('notification-broadcasts/:id/cancel')
  @ApiHeader({ name: 'idempotency-key', required: true })
  @ApiOkDataResponse(AdminNotificationBroadcastViewDto)
  @RequirePermissions(AdminNotificationBroadcastsSendPermission)
  cancelBroadcast(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param('id') id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.broadcastCommand(principal, id, 'cancel', key);
  }

  private async templateCommand(principal: AuthenticatedPrincipal, id: string, action: 'publish' | 'archive') {
    const result = await this.mutate(
      principal,
      `admin.notification_template.${action}`,
      `admin.notification-templates:${id}`,
      () =>
        action === 'publish'
          ? this.notifications.publishTemplate(id, principal.tenantId, principal.subject)
          : this.notifications.archiveTemplate(id, principal.tenantId, principal.subject),
    );
    return createOkResponse(this.requireFound(result));
  }

  private async broadcastCommand(
    principal: AuthenticatedPrincipal,
    id: string,
    action: string,
    key?: string,
    scheduledAt?: Date,
  ) {
    if (!key?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required.');
    }
    const result = await this.mutate(
      principal,
      'admin.notification_broadcast.command',
      `admin.notification-broadcasts:${id}`,
      () =>
        this.notifications.command({
          broadcastId: id,
          tenantId: principal.tenantId,
          actorId: principal.subject,
          action,
          idempotencyKey: key.trim(),
          scheduledAt,
        }),
      { action },
    );
    return createOkResponse(this.requireFound(result));
  }

  private async mutate<T>(
    principal: AuthenticatedPrincipal,
    action: Parameters<AuditLogAdminService['record']>[0]['action'],
    resource: string,
    operation: () => Promise<T>,
    metadata: Record<string, unknown> = {},
  ): Promise<T> {
    const [resourceName, explicitTargetId] = resource.split(':', 2);
    try {
      return await this.auditLogs.recordMutation(
        {
          tenantId: principal.tenantId,
          actorUserId: principal.subject,
          action,
          resource: resourceName ?? resource,
          targetId: (result) => explicitTargetId ?? extractAuditTargetId(result),
          after: (result) => toAuditSnapshot(result),
          metadata,
        },
        () => this.execute(operation),
      );
    } catch (error) {
      if (!(error instanceof AuditLogAdminPersistenceError)) {
        throw error;
      }
      throw new InternalServerErrorException('Notification change and audit recording were rolled back.');
    }
  }

  private requireFound<T>(value: T | null): T {
    if (!value) {
      throw new NotFoundException();
    }
    return value;
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code.includes('not_found') || code.includes('missing')) {
        throw new NotFoundException();
      }
      if (code.includes('code_owned')) {
        throw new ForbiddenException();
      }
      if (code.includes('conflict') || code.includes('stale_write') || code.includes('not_draft')) {
        throw new ConflictException();
      }
      throw new BadRequestException();
    }
  }
}

const extractAuditTargetId = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object' || !('id' in value)) {
    return undefined;
  }
  return typeof value.id === 'string' ? value.id : undefined;
};

const toAuditSnapshot = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const source = value as Record<string, unknown>;
  const snapshot: Record<string, unknown> = {};
  for (const key of ['id', 'code', 'name', 'status', 'version', 'channels', 'scheduledAt']) {
    if (source[key] !== undefined) {
      snapshot[key] = source[key];
    }
  }
  return snapshot;
};

interface NotificationAdminOperations {
  listTemplates: NotificationBroadcastPersistence['listTemplates'];
  getTemplate: NotificationBroadcastPersistence['getTemplate'];
  createTemplate: NotificationBroadcastPersistence['createAdminTemplate'];
  updateTemplate: NotificationBroadcastPersistence['updateAdminTemplate'];
  publishTemplate: NotificationBroadcastPersistence['publishAdminTemplate'];
  archiveTemplate: NotificationBroadcastPersistence['archiveAdminTemplate'];
  previewTemplate(
    id: string,
    tenantId: string,
    channel: NotificationDeliveryChannel,
    language: string,
    variables: NotificationData,
  ): Promise<unknown>;
  testSend(input: {
    id: string;
    tenantId: string;
    targetType: NotificationTargetType;
    targetId: string;
    channel: NotificationDeliveryChannel;
    provider: NotificationDeliveryProvider;
    language?: string;
    variables: NotificationData;
  }): Promise<NotificationRecord>;
  listResolvers(): NotificationSegmentResolverMetadata[];
  listSegments(tenantId: string, includeArchived?: boolean): Promise<NotificationSegmentRecord[]>;
  getSegment: NotificationBroadcastPersistence['getSegment'];
  createSegment: NotificationBroadcastPersistence['createSegment'];
  updateSegment: NotificationBroadcastPersistence['updateSegment'];
  archiveSegment: NotificationBroadcastPersistence['archiveSegment'];
  estimateSegment(id: string, tenantId: string): Promise<{ count: number }>;
  uploadSegmentCsv(input: {
    id: string;
    tenantId: string;
    actorId: string;
    filename: string;
    contentBase64: string;
  }): Promise<NotificationSegmentUploadRecord>;
  getSegmentUpload: NotificationBroadcastPersistence['getSegmentUpload'];
  listBroadcasts: NotificationBroadcastPersistence['listBroadcasts'];
  getBroadcast: NotificationBroadcastPersistence['getBroadcast'];
  createBroadcast: NotificationBroadcastPersistence['createBroadcast'];
  updateBroadcast: NotificationBroadcastPersistence['updateBroadcast'];
  command: NotificationBroadcastPersistence['transitionBroadcast'];
}
