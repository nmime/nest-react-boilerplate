import type { ResultAsync } from 'neverthrow';
import type { ProblemPresentationDisplay, ProblemPresentationSeverity } from '@app/common-problem-details';

export const ApiResponseStudioChangeStates = ['unchanged', 'new', 'modified', 'deleted'] as const;
export type ApiResponseStudioChangeState = (typeof ApiResponseStudioChangeStates)[number];
export const ApiResponseStudioMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'TRACE'] as const;
export type ApiResponseStudioMethod = (typeof ApiResponseStudioMethods)[number];
export const ApiResponseStudioStatuses = ['ERR', 'NET'] as const;
export type ApiResponseStudioSyntheticStatus = (typeof ApiResponseStudioStatuses)[number];
export type ApiResponseStudioStatus = `${number}` | 'default' | ApiResponseStudioSyntheticStatus;
export const ApiResponseStudioLanguages = ['en', 'ru', 'zh'] as const;
export type ApiResponseStudioLanguage = (typeof ApiResponseStudioLanguages)[number];

export interface ApiResponseStudioTexts {
  readonly en: readonly string[];
  readonly ru: readonly string[];
  readonly zh: readonly string[];
}

export interface ApiResponseStudioEnumChoice {
  readonly property: string;
  readonly values: readonly string[];
  readonly enabledValues: readonly string[];
}

export interface ApiResponseStudioPresentation {
  readonly display: ProblemPresentationDisplay;
  readonly severity: ProblemPresentationSeverity;
  readonly support: boolean;
  readonly customDescription: string;
  readonly figmaOnly: boolean;
  readonly comments: string;
  readonly texts: ApiResponseStudioTexts;
}

export interface ApiResponseStudioSourceRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  readonly jsonUrl: string;
  readonly docsUrl: string;
  readonly enabled: boolean;
  readonly manualOnly: boolean;
  readonly revision: number;
  readonly lastSyncAt: Date | null;
  readonly lastSyncStatus: 'never' | 'success' | 'failed';
  readonly lastSyncError: string;
  readonly lastSyncSummary: ApiResponseStudioSyncSummary | null;
  readonly createdByUserId: string;
  readonly updatedByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ApiResponseStudioResponseRecord extends ApiResponseStudioPresentation {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceId: string;
  readonly stableKey: string;
  readonly tag: string;
  readonly method: ApiResponseStudioMethod;
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly status: ApiResponseStudioStatus;
  readonly errorType: string;
  readonly description: string;
  readonly schemaSnapshot: string;
  readonly exampleSnapshot: string;
  readonly enumChoices: readonly ApiResponseStudioEnumChoice[];
  readonly changeState: ApiResponseStudioChangeState;
  readonly changeDismissed: boolean;
  readonly deleted: boolean;
  readonly sourceFingerprint: string;
  readonly revision: number;
  readonly updatedByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ApiResponseStudioHistoryRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceId: string | null;
  readonly responseId: string | null;
  readonly action: string;
  readonly actorUserId: string;
  readonly before: Record<string, unknown>;
  readonly after: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface ApiResponseStudioSyncSummary {
  readonly created: number;
  readonly modified: number;
  readonly deleted: number;
  readonly unchanged: number;
}

export interface ApiResponseStudioDashboardSource extends ApiResponseStudioSourceRecord {
  readonly totalResponses: number;
  readonly activeResponses: number;
  readonly newResponses: number;
  readonly modifiedResponses: number;
  readonly deletedResponses: number;
  readonly missingEn: number;
  readonly missingRu: number;
  readonly missingZh: number;
}

export interface ApiResponseStudioDashboard {
  readonly sources: readonly ApiResponseStudioDashboardSource[];
  readonly totals: {
    readonly sources: number;
    readonly enabledSources: number;
    readonly responses: number;
    readonly pendingChanges: number;
  };
}

export interface ApiResponseStudioResponseQuery {
  readonly sourceId?: string;
  readonly search?: string;
  readonly exact?: string;
  readonly status?: string;
  readonly method?: string;
  readonly display?: string;
  readonly changeState?: string;
  readonly missingLanguage?: ApiResponseStudioLanguage;
  readonly includeDeleted?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ApiResponseStudioHistoryQuery {
  readonly sourceId?: string;
  readonly responseId?: string;
  readonly action?: string;
  readonly actorUserId?: string;
  readonly createdFrom?: Date;
  readonly createdTo?: Date;
  readonly limit?: number;
  readonly offset?: number;
}

export interface CreateApiResponseStudioSourceInput {
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  readonly jsonUrl: string;
  readonly docsUrl?: string;
  readonly enabled?: boolean;
  readonly manualOnly?: boolean;
  readonly actorUserId: string;
  readonly metadata?: Record<string, unknown>;
}

export interface UpdateApiResponseStudioSourceInput {
  readonly tenantId: string;
  readonly id: string;
  readonly name?: string;
  readonly slug?: string;
  readonly jsonUrl?: string;
  readonly docsUrl?: string;
  readonly enabled?: boolean;
  readonly manualOnly?: boolean;
  readonly expectedRevision: number;
  readonly actorUserId: string;
  readonly metadata?: Record<string, unknown>;
}

export interface UpdateApiResponseStudioResponseInput extends ApiResponseStudioPresentation {
  readonly enumChoices?: readonly ApiResponseStudioEnumChoice[];
  readonly tenantId: string;
  readonly id: string;
  readonly expectedRevision: number;
  readonly actorUserId: string;
  readonly metadata?: Record<string, unknown>;
}

export interface BulkUpdateApiResponseStudioResponseInput {
  readonly tenantId: string;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly expectedRevision: number;
  }>;
  readonly patch: Partial<ApiResponseStudioPresentation>;
  readonly actorUserId: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ApiResponseStudioParsedVariant {
  readonly stableKey: string;
  readonly tag: string;
  readonly method: ApiResponseStudioMethod;
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly status: ApiResponseStudioStatus;
  readonly errorType: string;
  readonly description: string;
  readonly schemaSnapshot: string;
  readonly exampleSnapshot: string;
  readonly enumChoices: readonly ApiResponseStudioEnumChoice[];
  readonly sourceFingerprint: string;
}

export interface SyncApiResponseStudioSourceInput {
  readonly tenantId: string;
  readonly sourceId: string;
  readonly expectedRevision: number;
  readonly variants: readonly ApiResponseStudioParsedVariant[];
  readonly actorUserId: string;
  readonly metadata?: Record<string, unknown>;
  readonly syncedAt?: Date;
}

export interface ApiResponseStudioRepositoryError {
  readonly code: 'not_found' | 'repository_error' | 'revision_conflict' | 'validation_error';
  readonly message: string;
}

export interface ApiResponseStudioRepositoryPort {
  dashboard(tenantId: string): ResultAsync<ApiResponseStudioDashboard, ApiResponseStudioRepositoryError>;
  listSources(tenantId: string): ResultAsync<ApiResponseStudioSourceRecord[], ApiResponseStudioRepositoryError>;
  findSource(
    tenantId: string,
    sourceId: string,
  ): ResultAsync<ApiResponseStudioSourceRecord | null, ApiResponseStudioRepositoryError>;
  createSource(
    input: CreateApiResponseStudioSourceInput,
  ): ResultAsync<ApiResponseStudioSourceRecord, ApiResponseStudioRepositoryError>;
  updateSource(
    input: UpdateApiResponseStudioSourceInput,
  ): ResultAsync<ApiResponseStudioSourceRecord, ApiResponseStudioRepositoryError>;
  listResponses(
    tenantId: string,
    query?: ApiResponseStudioResponseQuery,
  ): ResultAsync<ApiResponseStudioResponseRecord[], ApiResponseStudioRepositoryError>;
  countResponses(
    tenantId: string,
    query?: ApiResponseStudioResponseQuery,
  ): ResultAsync<number, ApiResponseStudioRepositoryError>;
  updateResponse(
    input: UpdateApiResponseStudioResponseInput,
  ): ResultAsync<ApiResponseStudioResponseRecord, ApiResponseStudioRepositoryError>;
  resetResponse(input: {
    tenantId: string;
    id: string;
    expectedRevision: number;
    actorUserId: string;
    metadata?: Record<string, unknown>;
  }): ResultAsync<ApiResponseStudioResponseRecord, ApiResponseStudioRepositoryError>;
  bulkUpdate(
    input: BulkUpdateApiResponseStudioResponseInput,
  ): ResultAsync<ApiResponseStudioResponseRecord[], ApiResponseStudioRepositoryError>;
  dismissChanges(input: {
    tenantId: string;
    items: ReadonlyArray<{ id: string; expectedRevision: number }>;
    actorUserId: string;
    metadata?: Record<string, unknown>;
  }): ResultAsync<ApiResponseStudioResponseRecord[], ApiResponseStudioRepositoryError>;
  sync(
    input: SyncApiResponseStudioSourceInput,
  ): ResultAsync<
    { source: ApiResponseStudioSourceRecord; summary: ApiResponseStudioSyncSummary },
    ApiResponseStudioRepositoryError
  >;
  history(
    tenantId: string,
    query?: ApiResponseStudioHistoryQuery,
  ): ResultAsync<ApiResponseStudioHistoryRecord[], ApiResponseStudioRepositoryError>;
}

export const ApiResponseStudioRepositoryInjectToken = Symbol('ApiResponseStudioRepositoryInjectToken');
