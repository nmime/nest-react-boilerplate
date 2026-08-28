import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type {
  ApiResponseStudioChangeState,
  ApiResponseStudioEnumChoice,
  ApiResponseStudioMethod,
  ApiResponseStudioStatus,
  ApiResponseStudioSyncSummary,
  ApiResponseStudioTexts,
} from '@app/backend-feature-auth-shared';
import type { ProblemPresentationDisplay, ProblemPresentationSeverity } from '@app/common-problem-details';
import { DefaultAuthTenantId } from './auth-user.entity';

export class ApiResponseStudioSourceEntity {
  id: string = randomUUID();
  tenantId = DefaultAuthTenantId;
  name = '';
  slug = '';
  jsonUrl = '';
  docsUrl = '';
  enabled = true;
  manualOnly = true;
  revision = 1;
  lastSyncAt: Date | null = null;
  lastSyncStatus: 'never' | 'success' | 'failed' = 'never';
  lastSyncError = '';
  lastSyncSummary: ApiResponseStudioSyncSummary | null = null;
  createdByUserId = '';
  updatedByUserId = '';
  createdAt = new Date();
  updatedAt = new Date();
}

export class ApiResponseStudioResponseEntity {
  id: string = randomUUID();
  tenantId = DefaultAuthTenantId;
  sourceId = '';
  stableKey = '';
  tag = '';
  method: ApiResponseStudioMethod = 'GET';
  path = '';
  operationId = '';
  summary = '';
  status: ApiResponseStudioStatus = 'default';
  errorType = '';
  description = '';
  schemaSnapshot = '';
  exampleSnapshot = '';
  enumChoices: ApiResponseStudioEnumChoice[] = [];
  changeState: ApiResponseStudioChangeState = 'new';
  changeDismissed = false;
  deleted = false;
  sourceFingerprint = '';
  display: ProblemPresentationDisplay = 'toast';
  severity: ProblemPresentationSeverity = 'error';
  support = false;
  customDescription = '';
  figmaOnly = false;
  comments = '';
  texts: ApiResponseStudioTexts = { en: [], ru: [], zh: [] };
  revision = 1;
  updatedByUserId = '';
  createdAt = new Date();
  updatedAt = new Date();
}

export class ApiResponseStudioHistoryEntity {
  id: string = randomUUID();
  tenantId = DefaultAuthTenantId;
  sourceId: string | null = null;
  responseId: string | null = null;
  action = '';
  actorUserId = '';
  before: Record<string, unknown> = {};
  after: Record<string, unknown> = {};
  metadata: Record<string, unknown> = {};
  createdAt = new Date();
}

export const ApiResponseStudioSourceEntitySchema = new EntitySchema<ApiResponseStudioSourceEntity>({
  class: ApiResponseStudioSourceEntity,
  tableName: 'api_response_studio_sources',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'uuid', fieldName: 'tenant_id' },
    name: { type: 'varchar', length: 200 },
    slug: { type: 'varchar', length: 100 },
    jsonUrl: { type: 'text', fieldName: 'json_url' },
    docsUrl: { type: 'text', fieldName: 'docs_url', default: '' },
    enabled: { type: 'boolean', default: true },
    manualOnly: { type: 'boolean', fieldName: 'manual_only', default: true },
    revision: { type: 'integer', default: 1 },
    lastSyncAt: { type: 'timestamptz', fieldName: 'last_sync_at', nullable: true },
    lastSyncStatus: { type: 'varchar', fieldName: 'last_sync_status', length: 16, default: 'never' },
    lastSyncError: { type: 'text', fieldName: 'last_sync_error', default: '' },
    lastSyncSummary: { type: 'json', fieldName: 'last_sync_summary', nullable: true },
    createdByUserId: { type: 'uuid', fieldName: 'created_by_user_id' },
    updatedByUserId: { type: 'uuid', fieldName: 'updated_by_user_id' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  indexes: [{ name: 'ix__api_response_studio_sources__tenant_enabled', properties: ['tenantId', 'enabled'] }],
  uniques: [{ name: 'uq__api_response_studio_sources__tenant_slug', properties: ['tenantId', 'slug'] }],
});

export const ApiResponseStudioResponseEntitySchema = new EntitySchema<ApiResponseStudioResponseEntity>({
  class: ApiResponseStudioResponseEntity,
  tableName: 'api_response_studio_responses',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'uuid', fieldName: 'tenant_id' },
    sourceId: { type: 'uuid', fieldName: 'source_id' },
    stableKey: { type: 'varchar', fieldName: 'stable_key', length: 1000 },
    tag: { type: 'varchar', length: 200, default: '' },
    method: { type: 'varchar', length: 16 },
    path: { type: 'varchar', length: 1000 },
    operationId: { type: 'varchar', fieldName: 'operation_id', length: 300, default: '' },
    summary: { type: 'text', default: '' },
    status: { type: 'varchar', length: 16 },
    errorType: { type: 'varchar', fieldName: 'error_type', length: 200, default: '' },
    description: { type: 'text', default: '' },
    schemaSnapshot: { type: 'text', fieldName: 'schema_snapshot', default: '' },
    exampleSnapshot: { type: 'text', fieldName: 'example_snapshot', default: '' },
    enumChoices: { type: 'json', fieldName: 'enum_choices', defaultRaw: "'[]'::jsonb" },
    changeState: { type: 'varchar', fieldName: 'change_state', length: 16, default: 'new' },
    changeDismissed: { type: 'boolean', fieldName: 'change_dismissed', default: false },
    deleted: { type: 'boolean', default: false },
    sourceFingerprint: { type: 'varchar', fieldName: 'source_fingerprint', length: 64 },
    display: { type: 'varchar', length: 16, default: 'toast' },
    severity: { type: 'varchar', length: 16, default: 'error' },
    support: { type: 'boolean', default: false },
    customDescription: { type: 'text', fieldName: 'custom_description', default: '' },
    figmaOnly: { type: 'boolean', fieldName: 'figma_only', default: false },
    comments: { type: 'text', default: '' },
    texts: { type: 'json', defaultRaw: '\'{"en":[],"ru":[],"zh":[]}\'::jsonb' },
    revision: { type: 'integer', default: 1 },
    updatedByUserId: { type: 'uuid', fieldName: 'updated_by_user_id' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  indexes: [
    { name: 'ix__api_response_studio_responses__tenant_source_path', properties: ['tenantId', 'sourceId', 'path'] },
    {
      name: 'ix__api_response_studio_responses__tenant_change',
      properties: ['tenantId', 'changeState', 'changeDismissed'],
    },
    { name: 'ix__api_response_studio_responses__tenant_deleted', properties: ['tenantId', 'deleted'] },
  ],
  uniques: [
    { name: 'uq__api_response_studio_responses__tenant_source_key', properties: ['tenantId', 'sourceId', 'stableKey'] },
  ],
});

export const ApiResponseStudioHistoryEntitySchema = new EntitySchema<ApiResponseStudioHistoryEntity>({
  class: ApiResponseStudioHistoryEntity,
  tableName: 'api_response_studio_history',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'uuid', fieldName: 'tenant_id' },
    sourceId: { type: 'uuid', fieldName: 'source_id', nullable: true },
    responseId: { type: 'uuid', fieldName: 'response_id', nullable: true },
    action: { type: 'varchar', length: 128 },
    actorUserId: { type: 'uuid', fieldName: 'actor_user_id' },
    before: { type: 'json', defaultRaw: "'{}'::jsonb" },
    after: { type: 'json', defaultRaw: "'{}'::jsonb" },
    metadata: { type: 'json', defaultRaw: "'{}'::jsonb" },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
  },
  indexes: [
    { name: 'ix__api_response_studio_history__tenant_created', properties: ['tenantId', 'createdAt'] },
    {
      name: 'ix__api_response_studio_history__tenant_source_created',
      properties: ['tenantId', 'sourceId', 'createdAt'],
    },
    {
      name: 'ix__api_response_studio_history__tenant_response_created',
      properties: ['tenantId', 'responseId', 'createdAt'],
    },
  ],
});
