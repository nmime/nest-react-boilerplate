/* eslint-disable @typescript-eslint/naming-convention, @typescript-eslint/no-unnecessary-condition, sonarjs/no-nested-conditional, @typescript-eslint/require-await -- Repository mappings preserve database column names and transaction-port signatures. */
import { EntityManager, LockMode } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import type {
  ApiResponseStudioDashboard,
  ApiResponseStudioHistoryQuery,
  ApiResponseStudioHistoryRecord,
  ApiResponseStudioRepositoryError,
  ApiResponseStudioRepositoryPort,
  ApiResponseStudioResponseQuery,
  ApiResponseStudioResponseRecord,
  ApiResponseStudioSourceRecord,
  BulkUpdateApiResponseStudioResponseInput,
  CreateApiResponseStudioSourceInput,
  SyncApiResponseStudioSourceInput,
  UpdateApiResponseStudioResponseInput,
  UpdateApiResponseStudioSourceInput,
} from '@app/backend-feature-auth-shared';
import {
  AdminAuditLogEntity,
  type AdminAuditAction,
  ApiResponseStudioHistoryEntity,
  ApiResponseStudioResponseEntity,
  ApiResponseStudioSourceEntity,
  TransactionalOutboxEventEntity,
} from '../entities';

class StudioRevisionConflict extends Error {}
class StudioNotFound extends Error {}
class StudioValidationError extends Error {}
const MAX_BULK_ITEMS = 200;
const MAX_SNAPSHOT_BYTES = 32 * 1024;
const cleanObject = (value: unknown, depth = 0): unknown => {
  if (depth > 6) {
    return '[truncated]';
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => cleanObject(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => [
          key,
          /authorization|cookie|credential|password|secret|token/iu.test(key)
            ? '[redacted]'
            : cleanObject(item, depth + 1),
        ]),
    );
  }
  return typeof value === 'string' ? value.slice(0, 4000) : value;
};
const bounded = (value: unknown): Record<string, unknown> => {
  const cleaned = cleanObject(value);
  const serialized = JSON.stringify(cleaned);
  return Buffer.byteLength(serialized, 'utf8') <= MAX_SNAPSHOT_BYTES
    ? ((cleaned as Record<string, unknown>) ?? {})
    : { truncated: true, bytes: Buffer.byteLength(serialized, 'utf8') };
};
const studioError = (cause: unknown): ApiResponseStudioRepositoryError =>
  cause instanceof StudioRevisionConflict
    ? { code: 'revision_conflict', message: 'The API response changed after it was loaded. Refresh and try again.' }
    : cause instanceof StudioNotFound
      ? { code: 'not_found', message: 'The API Response Studio record was not found.' }
      : cause instanceof StudioValidationError
        ? { code: 'validation_error', message: cause.message }
        : {
            code: 'repository_error',
            message: cause instanceof Error ? cause.message : 'API Response Studio repository failed.',
          };
const result = <T>(promise: Promise<T>): ResultAsync<T, ApiResponseStudioRepositoryError> =>
  ResultAsync.fromPromise(promise, studioError);
const sourceRecord = (entity: ApiResponseStudioSourceEntity): ApiResponseStudioSourceRecord => ({ ...entity });
const responseRecord = (entity: ApiResponseStudioResponseEntity): ApiResponseStudioResponseRecord => ({
  ...entity,
  texts: { en: [...entity.texts.en], ru: [...entity.texts.ru], zh: [...entity.texts.zh] },
});
const historyRecord = (entity: ApiResponseStudioHistoryEntity): ApiResponseStudioHistoryRecord => ({ ...entity });

@Injectable()
export class ApiResponseStudioRepository implements ApiResponseStudioRepositoryPort {
  constructor(@Inject(EntityManager) private readonly entityManager: EntityManager) {}

  dashboard(tenantId: string): ResultAsync<ApiResponseStudioDashboard, ApiResponseStudioRepositoryError> {
    return result(
      Promise.all([
        this.entityManager.find(ApiResponseStudioSourceEntity, { tenantId }, { orderBy: { name: 'ASC' } }),
        this.entityManager.find(ApiResponseStudioResponseEntity, { tenantId }),
      ]).then(([sources, responses]) => {
        const dashboardSources = sources.map((source) => {
          const rows = responses.filter((row) => row.sourceId === source.id);
          return {
            ...sourceRecord(source),
            totalResponses: rows.length,
            activeResponses: rows.filter((row) => !row.deleted).length,
            newResponses: rows.filter((row) => row.changeState === 'new' && !row.changeDismissed).length,
            modifiedResponses: rows.filter((row) => row.changeState === 'modified' && !row.changeDismissed).length,
            deletedResponses: rows.filter((row) => row.deleted && !row.changeDismissed).length,
            missingEn: rows.filter((row) => !row.deleted && row.texts.en.length === 0).length,
            missingRu: rows.filter((row) => !row.deleted && row.texts.ru.length === 0).length,
            missingZh: rows.filter((row) => !row.deleted && row.texts.zh.length === 0).length,
          };
        });
        return {
          sources: dashboardSources,
          totals: {
            sources: sources.length,
            enabledSources: sources.filter((source) => source.enabled).length,
            responses: responses.filter((row) => !row.deleted).length,
            pendingChanges: responses.filter((row) => row.changeState !== 'unchanged' && !row.changeDismissed).length,
          },
        };
      }),
    );
  }

  listSources(tenantId: string) {
    return result(
      this.entityManager
        .find(ApiResponseStudioSourceEntity, { tenantId }, { orderBy: { name: 'ASC' } })
        .then((rows) => rows.map(sourceRecord)),
    );
  }
  findSource(tenantId: string, sourceId: string) {
    return result(
      this.entityManager
        .findOne(ApiResponseStudioSourceEntity, { tenantId, id: sourceId })
        .then((row) => (row ? sourceRecord(row) : null)),
    );
  }

  createSource(input: CreateApiResponseStudioSourceInput) {
    return result(
      this.entityManager.transactional(async (em) => {
        const now = new Date();
        const entity = Object.assign(new ApiResponseStudioSourceEntity(), {
          tenantId: input.tenantId,
          name: input.name.trim(),
          slug: input.slug.trim().toLowerCase(),
          jsonUrl: input.jsonUrl.trim(),
          docsUrl: input.docsUrl?.trim() ?? '',
          enabled: input.enabled ?? true,
          manualOnly: input.manualOnly ?? true,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
          createdAt: now,
          updatedAt: now,
        });
        em.persist(entity);
        await this.audit(em, {
          tenantId: input.tenantId,
          sourceId: entity.id,
          action: 'admin.api_response_studio.source.create',
          actorUserId: input.actorUserId,
          before: {},
          after: sourceRecord(entity),
          metadata: input.metadata,
        });
        await em.flush();
        return sourceRecord(entity);
      }),
    );
  }

  updateSource(input: UpdateApiResponseStudioSourceInput) {
    return result(
      this.entityManager.transactional(async (em) => {
        const entity = await em.findOne(
          ApiResponseStudioSourceEntity,
          { tenantId: input.tenantId, id: input.id },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!entity) {
          throw new StudioNotFound();
        }
        if (entity.revision !== input.expectedRevision) {
          throw new StudioRevisionConflict();
        }
        const before = sourceRecord(entity);
        if (input.name !== undefined) {
          entity.name = input.name.trim();
        }
        if (input.slug !== undefined) {
          entity.slug = input.slug.trim().toLowerCase();
        }
        if (input.jsonUrl !== undefined) {
          entity.jsonUrl = input.jsonUrl.trim();
        }
        if (input.docsUrl !== undefined) {
          entity.docsUrl = input.docsUrl.trim();
        }
        if (input.enabled !== undefined) {
          entity.enabled = input.enabled;
        }
        if (input.manualOnly !== undefined) {
          entity.manualOnly = input.manualOnly;
        }
        entity.revision += 1;
        entity.updatedByUserId = input.actorUserId;
        entity.updatedAt = new Date();
        await this.audit(em, {
          tenantId: input.tenantId,
          sourceId: entity.id,
          action: 'admin.api_response_studio.source.update',
          actorUserId: input.actorUserId,
          before,
          after: sourceRecord(entity),
          metadata: input.metadata,
        });
        await em.flush();
        return sourceRecord(entity);
      }),
    );
  }

  listResponses(tenantId: string, query: ApiResponseStudioResponseQuery = {}) {
    return result(
      this.filteredResponses(tenantId, query).then((rows) =>
        rows
          .slice(
            Math.max(0, query.offset ?? 0),
            Math.max(0, query.offset ?? 0) + Math.min(Math.max(1, query.limit ?? 100), 500),
          )
          .map(responseRecord),
      ),
    );
  }
  countResponses(tenantId: string, query: ApiResponseStudioResponseQuery = {}) {
    return result(this.filteredResponses(tenantId, query).then((rows) => rows.length));
  }

  updateResponse(input: UpdateApiResponseStudioResponseInput) {
    return result(
      this.entityManager.transactional(async (em) => {
        const entity = await this.lockResponse(em, input.tenantId, input.id, input.expectedRevision);
        const before = responseRecord(entity);
        Object.assign(entity, {
          display: input.display,
          severity: input.severity,
          support: input.support,
          customDescription: input.customDescription,
          figmaOnly: input.figmaOnly,
          comments: input.comments,
          texts: { en: [...input.texts.en], ru: [...input.texts.ru], zh: [...input.texts.zh] },
          enumChoices: (input.enumChoices ?? entity.enumChoices).map((choice) => ({
            property: choice.property,
            values: [...choice.values],
            enabledValues: choice.enabledValues.filter((value) => choice.values.includes(value)),
          })),
          updatedByUserId: input.actorUserId,
          updatedAt: new Date(),
          revision: entity.revision + 1,
        });
        await this.audit(em, {
          tenantId: input.tenantId,
          sourceId: entity.sourceId,
          responseId: entity.id,
          action: 'admin.api_response_studio.response.update',
          actorUserId: input.actorUserId,
          before,
          after: responseRecord(entity),
          metadata: input.metadata,
        });
        await em.flush();
        return responseRecord(entity);
      }),
    );
  }

  resetResponse(input: {
    tenantId: string;
    id: string;
    expectedRevision: number;
    actorUserId: string;
    metadata?: Record<string, unknown>;
  }) {
    return result(
      this.entityManager.transactional(async (em) => {
        const entity = await this.lockResponse(em, input.tenantId, input.id, input.expectedRevision);
        const before = responseRecord(entity);
        Object.assign(entity, {
          display: 'toast',
          severity: 'error',
          support: false,
          customDescription: '',
          figmaOnly: false,
          comments: '',
          texts: { en: [], ru: [], zh: [] },
          updatedByUserId: input.actorUserId,
          updatedAt: new Date(),
          revision: entity.revision + 1,
        });
        await this.audit(em, {
          tenantId: input.tenantId,
          sourceId: entity.sourceId,
          responseId: entity.id,
          action: 'admin.api_response_studio.response.reset',
          actorUserId: input.actorUserId,
          before,
          after: responseRecord(entity),
          metadata: input.metadata,
        });
        await em.flush();
        return responseRecord(entity);
      }),
    );
  }

  bulkUpdate(input: BulkUpdateApiResponseStudioResponseInput) {
    return result(
      this.withBoundedItems(input.items, 'Bulk update', (items) =>
        this.entityManager.transactional(async (em) => {
          const entities = await this.lockMany(em, input.tenantId, items);
          const before = entities.map(responseRecord);
          for (const entity of entities) {
            if (input.patch.display !== undefined) {
              entity.display = input.patch.display;
            }
            if (input.patch.severity !== undefined) {
              entity.severity = input.patch.severity;
            }
            if (input.patch.support !== undefined) {
              entity.support = input.patch.support;
            }
            if (input.patch.customDescription !== undefined) {
              entity.customDescription = input.patch.customDescription;
            }
            if (input.patch.figmaOnly !== undefined) {
              entity.figmaOnly = input.patch.figmaOnly;
            }
            if (input.patch.comments !== undefined) {
              entity.comments = input.patch.comments;
            }
            if (input.patch.texts !== undefined) {
              entity.texts = {
                en: [...input.patch.texts.en],
                ru: [...input.patch.texts.ru],
                zh: [...input.patch.texts.zh],
              };
            }
            entity.revision += 1;
            entity.updatedByUserId = input.actorUserId;
            entity.updatedAt = new Date();
          }
          await this.audit(em, {
            tenantId: input.tenantId,
            sourceId: entities[0]?.sourceId ?? null,
            action: 'admin.api_response_studio.response.bulk_update',
            actorUserId: input.actorUserId,
            before: { rows: before },
            after: { rows: entities.map(responseRecord) },
            metadata: input.metadata,
          });
          await em.flush();
          return entities.map(responseRecord);
        }),
      ),
    );
  }

  dismissChanges(input: {
    tenantId: string;
    items: ReadonlyArray<{ id: string; expectedRevision: number }>;
    actorUserId: string;
    metadata?: Record<string, unknown>;
  }) {
    return result(
      this.withBoundedItems(input.items, 'Dismiss', (items) =>
        this.entityManager.transactional(async (em) => {
          const entities = await this.lockMany(em, input.tenantId, items);
          const before = entities.map(responseRecord);
          for (const entity of entities) {
            entity.changeDismissed = true;
            entity.revision += 1;
            entity.updatedByUserId = input.actorUserId;
            entity.updatedAt = new Date();
          }
          await this.audit(em, {
            tenantId: input.tenantId,
            sourceId: entities[0]?.sourceId ?? null,
            action: 'admin.api_response_studio.change.dismiss',
            actorUserId: input.actorUserId,
            before: { rows: before },
            after: { rows: entities.map(responseRecord) },
            metadata: input.metadata,
          });
          await em.flush();
          return entities.map(responseRecord);
        }),
      ),
    );
  }

  sync(input: SyncApiResponseStudioSourceInput) {
    return result(
      this.entityManager.transactional(async (em) => {
        const source = await em.findOne(
          ApiResponseStudioSourceEntity,
          { tenantId: input.tenantId, id: input.sourceId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!source) {
          throw new StudioNotFound();
        }
        if (source.revision !== input.expectedRevision) {
          throw new StudioRevisionConflict();
        }
        const existing = await em.find(
          ApiResponseStudioResponseEntity,
          { tenantId: input.tenantId, sourceId: input.sourceId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        const byKey = new Map(existing.map((row) => [row.stableKey, row]));
        const incoming = new Set(input.variants.map((row) => row.stableKey));
        const summary = { created: 0, modified: 0, deleted: 0, unchanged: 0 };
        for (const variant of input.variants) {
          const current = byKey.get(variant.stableKey);
          if (!current) {
            em.persist(
              Object.assign(new ApiResponseStudioResponseEntity(), {
                ...variant,
                tenantId: input.tenantId,
                sourceId: input.sourceId,
                updatedByUserId: input.actorUserId,
                createdAt: input.syncedAt ?? new Date(),
                updatedAt: input.syncedAt ?? new Date(),
              }),
            );
            summary.created += 1;
          } else if (current.sourceFingerprint !== variant.sourceFingerprint || current.deleted) {
            Object.assign(current, variant, {
              deleted: false,
              changeState: current.deleted ? 'new' : 'modified',
              changeDismissed: false,
              revision: current.revision + 1,
              updatedByUserId: input.actorUserId,
              updatedAt: input.syncedAt ?? new Date(),
            });
            summary.modified += 1;
          } else {
            summary.unchanged += 1;
          }
        }
        for (const current of existing) {
          if (!incoming.has(current.stableKey) && !current.deleted) {
            current.deleted = true;
            current.changeState = 'deleted';
            current.changeDismissed = false;
            current.revision += 1;
            current.updatedByUserId = input.actorUserId;
            current.updatedAt = input.syncedAt ?? new Date();
            summary.deleted += 1;
          }
        }
        const changed = summary.created + summary.modified + summary.deleted > 0;
        source.lastSyncAt = input.syncedAt ?? new Date();
        source.lastSyncStatus = 'success';
        source.lastSyncError = '';
        source.lastSyncSummary = summary;
        source.updatedByUserId = input.actorUserId;
        source.updatedAt = input.syncedAt ?? new Date();
        if (changed) {
          source.revision += 1;
        }
        await this.audit(em, {
          tenantId: input.tenantId,
          sourceId: source.id,
          action: 'admin.api_response_studio.sync',
          actorUserId: input.actorUserId,
          before: {},
          after: { summary },
          metadata: input.metadata,
        });
        await em.flush();
        return { source: sourceRecord(source), summary };
      }),
    );
  }

  history(tenantId: string, query: ApiResponseStudioHistoryQuery = {}) {
    return result(
      this.entityManager
        .find(ApiResponseStudioHistoryEntity, { tenantId }, { orderBy: { createdAt: 'DESC' } })
        .then((rows) =>
          rows
            .filter((row) => !query.sourceId || row.sourceId === query.sourceId)
            .filter((row) => !query.responseId || row.responseId === query.responseId)
            .filter((row) => !query.action || row.action === query.action)
            .filter((row) => !query.actorUserId || row.actorUserId === query.actorUserId)
            .filter((row) => !query.createdFrom || row.createdAt >= query.createdFrom)
            .filter((row) => !query.createdTo || row.createdAt <= query.createdTo)
            .slice(
              Math.max(0, query.offset ?? 0),
              Math.max(0, query.offset ?? 0) + Math.min(Math.max(1, query.limit ?? 100), 500),
            )
            .map(historyRecord),
        ),
    );
  }

  private async filteredResponses(
    tenantId: string,
    query: ApiResponseStudioResponseQuery,
  ): Promise<ApiResponseStudioResponseEntity[]> {
    const rows = await this.entityManager.find(
      ApiResponseStudioResponseEntity,
      { tenantId },
      { orderBy: { sourceId: 'ASC', tag: 'ASC', path: 'ASC', method: 'ASC', status: 'ASC', stableKey: 'ASC' } },
    );
    const search = query.search?.trim().toLowerCase();
    return rows
      .filter((row) => (query.includeDeleted ? true : !row.deleted))
      .filter((row) => !query.sourceId || row.sourceId === query.sourceId)
      .filter((row) => !query.exact || row.stableKey === query.exact)
      .filter((row) => !query.status || row.status === query.status)
      .filter((row) => !query.method || row.method === query.method.toUpperCase())
      .filter((row) => !query.display || row.display === query.display)
      .filter((row) => !query.changeState || row.changeState === query.changeState)
      .filter((row) => !query.missingLanguage || row.texts[query.missingLanguage].length === 0)
      .filter(
        (row) =>
          !search ||
          [row.stableKey, row.tag, row.path, row.operationId, row.summary, row.errorType, row.description].some(
            (value) => value.toLowerCase().includes(search),
          ),
      );
  }
  private async lockResponse(em: EntityManager, tenantId: string, id: string, revision: number) {
    const entity = await em.findOne(
      ApiResponseStudioResponseEntity,
      { tenantId, id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    if (!entity) {
      throw new StudioNotFound();
    }
    if (entity.revision !== revision) {
      throw new StudioRevisionConflict();
    }
    return entity;
  }
  private withBoundedItems<T>(
    items: ReadonlyArray<{ id: string; expectedRevision: number }>,
    operation: string,
    run: (items: ReadonlyArray<{ id: string; expectedRevision: number }>) => Promise<T>,
  ): Promise<T> {
    if (items.length === 0 || items.length > MAX_BULK_ITEMS) {
      return Promise.reject(new StudioValidationError(`${operation} requires between 1 and 200 rows.`));
    }
    return run(items);
  }
  private async lockMany(
    em: EntityManager,
    tenantId: string,
    items: ReadonlyArray<{ id: string; expectedRevision: number }>,
  ) {
    const unique = new Map(items.map((item) => [item.id, item]));
    if (unique.size !== items.length) {
      throw new StudioRevisionConflict();
    }
    const entities = await em.find(
      ApiResponseStudioResponseEntity,
      { tenantId, id: { $in: [...unique.keys()] } },
      { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: 'ASC' } },
    );
    if (
      entities.length !== items.length ||
      entities.some((entity) => entity.revision !== unique.get(entity.id)?.expectedRevision)
    ) {
      throw new StudioRevisionConflict();
    }
    return entities;
  }
  private async audit(
    em: EntityManager,
    input: {
      tenantId: string;
      sourceId?: string | null;
      responseId?: string | null;
      action: string;
      actorUserId: string;
      before: unknown;
      after: unknown;
      metadata?: Record<string, unknown>;
    },
  ) {
    const history = Object.assign(new ApiResponseStudioHistoryEntity(), {
      tenantId: input.tenantId,
      sourceId: input.sourceId ?? null,
      responseId: input.responseId ?? null,
      action: input.action,
      actorUserId: input.actorUserId,
      before: bounded(input.before),
      after: bounded(input.after),
      metadata: bounded(input.metadata ?? {}),
      createdAt: new Date(),
    });
    const audit = new AdminAuditLogEntity({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action as AdminAuditAction,
      resource: 'admin.settings.api_response_studio',
      before: history.before,
      after: history.after,
      metadata: {
        historyId: history.id,
        sourceId: history.sourceId,
        responseId: history.responseId,
        ...history.metadata,
      },
    });
    const outbox = new TransactionalOutboxEventEntity({
      tenantId: input.tenantId,
      aggregateType: 'api-response-studio',
      aggregateId: history.id,
      eventType: input.action,
      payload: { historyId: history.id, before: history.before, after: history.after },
      metadata: history.metadata,
    });
    em.persist([history, audit, outbox]);
  }
}
