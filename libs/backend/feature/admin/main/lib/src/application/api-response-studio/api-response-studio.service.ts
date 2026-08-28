import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync, errAsync } from 'neverthrow';
import {
  ApiResponseStudioRepositoryInjectToken,
  type ApiResponseStudioHistoryQuery,
  type ApiResponseStudioPresentation,
  type ApiResponseStudioRepositoryError,
  type ApiResponseStudioRepositoryPort,
  type ApiResponseStudioResponseQuery,
  type BulkUpdateApiResponseStudioResponseInput,
  type CreateApiResponseStudioSourceInput,
  type UpdateApiResponseStudioSourceInput,
} from '@app/backend-feature-auth-shared';
import { parseOpenApiResponses } from './openapi-parser';
import { SafeOpenApiFetcher } from './safe-openapi-fetcher';
import { ApiResponseStudioValidationError, normalizeAndValidatePresentation } from './text-validation';

const validationError = (message: string): ApiResponseStudioRepositoryError => ({ code: 'validation_error', message });
const normalizeError = (error: unknown): ApiResponseStudioRepositoryError =>
  error instanceof ApiResponseStudioValidationError || error instanceof Error
    ? validationError(error.message)
    : validationError('API Response Studio request is invalid.');

@Injectable()
export class ApiResponseStudioService {
  constructor(
    @Inject(ApiResponseStudioRepositoryInjectToken)
    private readonly repository: ApiResponseStudioRepositoryPort,
    private readonly fetcher: SafeOpenApiFetcher,
  ) {}

  dashboard(tenantId: string) {
    return this.repository.dashboard(tenantId);
  }
  listSources(tenantId: string) {
    return this.repository.listSources(tenantId);
  }
  listResponses(tenantId: string, query?: ApiResponseStudioResponseQuery) {
    return this.repository.listResponses(tenantId, query);
  }
  countResponses(tenantId: string, query?: ApiResponseStudioResponseQuery) {
    return this.repository.countResponses(tenantId, query);
  }
  history(tenantId: string, query?: ApiResponseStudioHistoryQuery) {
    return this.repository.history(tenantId, query);
  }
  createSource(input: CreateApiResponseStudioSourceInput) {
    return this.repository.createSource(input);
  }
  updateSource(input: UpdateApiResponseStudioSourceInput) {
    return this.repository.updateSource(input);
  }

  updateResponse(input: {
    tenantId: string;
    id: string;
    expectedRevision: number;
    actorUserId: string;
    metadata?: Record<string, unknown>;
    presentation: ApiResponseStudioPresentation;
  }) {
    try {
      return this.repository.updateResponse({
        ...normalizeAndValidatePresentation(input.presentation),
        tenantId: input.tenantId,
        id: input.id,
        expectedRevision: input.expectedRevision,
        actorUserId: input.actorUserId,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
    } catch (error) {
      return errAsync(normalizeError(error));
    }
  }

  bulkUpdate(
    input: Omit<BulkUpdateApiResponseStudioResponseInput, 'patch'> & { patch: Partial<ApiResponseStudioPresentation> },
  ) {
    if (input.items.length === 0 || input.items.length > 200)
      return errAsync(validationError('Bulk update requires between 1 and 200 rows.'));
    try {
      const patch =
        'texts' in input.patch
          ? normalizeAndValidatePresentation({
              display: input.patch.display ?? 'toast',
              severity: input.patch.severity ?? 'error',
              support: input.patch.support ?? false,
              customDescription: input.patch.customDescription ?? '',
              figmaOnly: input.patch.figmaOnly ?? false,
              comments: input.patch.comments ?? '',
              texts: input.patch.texts ?? { en: [], ru: [], zh: [] },
            })
          : input.patch;
      return this.repository.bulkUpdate({ ...input, patch });
    } catch (error) {
      return errAsync(normalizeError(error));
    }
  }

  resetResponse(input: {
    tenantId: string;
    id: string;
    expectedRevision: number;
    actorUserId: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.repository.resetResponse(input);
  }
  dismissChanges(input: {
    tenantId: string;
    items: ReadonlyArray<{ id: string; expectedRevision: number }>;
    actorUserId: string;
    metadata?: Record<string, unknown>;
  }) {
    if (input.items.length === 0 || input.items.length > 200)
      return errAsync(validationError('Dismiss requires between 1 and 200 rows.'));
    return this.repository.dismissChanges(input);
  }

  sync(input: {
    tenantId: string;
    sourceId: string;
    expectedRevision: number;
    actorUserId: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.repository.findSource(input.tenantId, input.sourceId).andThen((source) => {
      if (!source)
        return errAsync<never, ApiResponseStudioRepositoryError>(validationError('OpenAPI source was not found.'));
      return ResultAsync.fromPromise(
        this.fetcher.fetchJson(source.jsonUrl).then((document) => parseOpenApiResponses(document)),
        normalizeError,
      ).andThen((variants) => this.repository.sync({ ...input, variants }));
    });
  }

  export(tenantId: string, query?: ApiResponseStudioResponseQuery) {
    return this.repository.listResponses(tenantId, { ...query, limit: 10_000, offset: 0 }).andThen((rows) => {
      const payload = rows
        .filter((row) => !row.deleted)
        .sort((a, b) => a.stableKey.localeCompare(b.stableKey))
        .map((row) => ({
          ruleId: row.stableKey,
          display: row.display,
          severity: row.severity,
          support: row.support,
          customDescription: row.customDescription || undefined,
          figmaOnly: row.figmaOnly || undefined,
          comments: row.comments || undefined,
          texts: row.texts,
          messageEn: row.texts.en[0],
          messageRu: row.texts.ru[0],
          messageZh: row.texts.zh[0],
          revision: row.revision,
          updatedAt: row.updatedAt.toISOString(),
          updatedByUserId: row.updatedByUserId,
        }));
      const content = `${JSON.stringify(payload, null, 2)}\n`;
      return Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024
        ? errAsync(validationError('Export exceeds the 2 MiB limit.'))
        : ResultAsync.fromSafePromise(
            Promise.resolve({
              filename: 'api-response-presentations.json',
              mediaType: 'application/json; charset=utf-8',
              content,
            }),
          );
    });
  }
}
