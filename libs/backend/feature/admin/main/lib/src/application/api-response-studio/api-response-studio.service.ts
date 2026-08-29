/* eslint-disable sonarjs/no-nested-functions -- Sync composes bounded external-reference traversal inside neverthrow result chains. */
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync, errAsync } from 'neverthrow';
import {
  ApiResponseStudioRepositoryInjectToken,
  type ApiResponseStudioEnumChoice,
  type ApiResponseStudioHistoryQuery,
  type ApiResponseStudioPresentation,
  type ApiResponseStudioRepositoryError,
  type ApiResponseStudioRepositoryPort,
  type ApiResponseStudioResponseQuery,
  type ApiResponseStudioResponseRecord,
  type BulkUpdateApiResponseStudioResponseInput,
  type CreateApiResponseStudioSourceInput,
  type UpdateApiResponseStudioSourceInput,
} from '@app/backend-feature-auth-shared';
import { collectExternalOpenApiRefs, parseOpenApiResponses } from './openapi-parser';
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
    enumChoices?: readonly ApiResponseStudioEnumChoice[];
  }) {
    try {
      const enumChoices = input.enumChoices?.map((choice) => {
        const property = choice.property.trim();
        const values = [...new Set(choice.values.map((value) => value.trim()))]
          .filter(Boolean)
          .sort((left, right) => left.localeCompare(right));
        if (!property || values.length === 0) {
          throw new ApiResponseStudioValidationError('Enum choices require a property and at least one value.');
        }
        return {
          property,
          values,
          enabledValues: [...new Set(choice.enabledValues.map((value) => value.trim()))]
            .filter((value) => values.includes(value))
            .sort((left, right) => left.localeCompare(right)),
        };
      });
      if (enumChoices && new Set(enumChoices.map((choice) => choice.property)).size !== enumChoices.length) {
        throw new ApiResponseStudioValidationError('Enum choice properties must be unique.');
      }
      return this.repository.updateResponse({
        ...normalizeAndValidatePresentation(input.presentation),
        ...(enumChoices ? { enumChoices } : {}),
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
    if (input.items.length === 0 || input.items.length > 200) {
      return errAsync(validationError('Bulk update requires between 1 and 200 rows.'));
    }
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
    if (input.items.length === 0 || input.items.length > 200) {
      return errAsync(validationError('Dismiss requires between 1 and 200 rows.'));
    }
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
      if (!source) {
        return errAsync<never, ApiResponseStudioRepositoryError>(validationError('OpenAPI source was not found.'));
      }
      const existingRows: ApiResponseStudioResponseRecord[] = [];
      const loadExistingRows = (offset = 0): ResultAsync<void, ApiResponseStudioRepositoryError> =>
        offset >= 10_000
          ? errAsync(validationError('OpenAPI source exceeds the 10000-row synchronization limit.'))
          : this.repository
              .listResponses(input.tenantId, {
                sourceId: input.sourceId,
                includeDeleted: true,
                limit: 500,
                offset,
              })
              .andThen((page) => {
                existingRows.push(...page);
                return page.length < 500
                  ? ResultAsync.fromSafePromise(Promise.resolve())
                  : loadExistingRows(offset + 500);
              });
      return loadExistingRows()
        .andThen(() =>
          ResultAsync.fromPromise(
            this.fetcher.fetchJson(source.jsonUrl).then(async (document) => {
              const externalDocuments: Record<string, Record<string, unknown>> = {};
              let frontier = collectExternalOpenApiRefs(document, source.jsonUrl);
              const maxExternalDocuments = 32;
              while (frontier.length > 0) {
                const next = frontier.filter((url) => !(url in externalDocuments));
                if (Object.keys(externalDocuments).length + next.length > maxExternalDocuments) {
                  throw new Error(`OpenAPI external references exceed the ${maxExternalDocuments}-document limit.`);
                }
                for (const url of next) {
                  // Fetching is intentionally ordered: every hop is independently URL/DNS/size validated.
                  // eslint-disable-next-line no-await-in-loop
                  const external = await this.fetcher.fetchJsonReference(url);
                  externalDocuments[url] = external;
                }
                frontier = next.flatMap((url) =>
                  collectExternalOpenApiRefs(externalDocuments[url] ?? {}, url).filter(
                    (candidate) => !(candidate in externalDocuments),
                  ),
                );
              }
              const enumChoicesByBaseKey = Object.fromEntries(
                [...existingRows]
                  .sort((left, right) => {
                    const updated = left.updatedAt.getTime() - right.updatedAt.getTime();
                    return updated || left.revision - right.revision || left.stableKey.localeCompare(right.stableKey);
                  })
                  .map((row) => [`${row.method}:${row.path}:${row.status}:${row.errorType || '-'}`, row.enumChoices]),
              );
              return parseOpenApiResponses(document, {
                externalDocuments,
                enumChoicesByBaseKey,
                baseUrl: source.jsonUrl,
              });
            }),
            normalizeError,
          ),
        )
        .andThen((variants) => this.repository.sync({ ...input, variants }));
    });
  }

  export(tenantId: string, query?: ApiResponseStudioResponseQuery) {
    return ResultAsync.fromPromise(
      (async () => {
        const rows: ApiResponseStudioResponseRecord[] = [];
        const pageSize = 500;
        const maxRows = 10_000;
        for (let offset = 0; offset < maxRows; offset += pageSize) {
          // Export pagination is intentionally sequential to preserve deterministic repository ordering.
          // eslint-disable-next-line no-await-in-loop
          const page = await this.repository.listResponses(tenantId, { ...query, limit: pageSize, offset });
          if (page.isErr()) {
            throw new Error(page.error.message);
          }
          rows.push(...page.value);
          if (page.value.length < pageSize) {
            return rows;
          }
        }
        throw new Error(`Export exceeds the ${maxRows}-row limit.`);
      })(),
      normalizeError,
    ).andThen((rows) => {
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
