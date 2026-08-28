import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ResultAsync } from 'neverthrow';
import type { ClientSession, Db, Document, MongoClient } from 'mongodb';
import type {
  AdminAuditAction,
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
import { AuthMongoCollections } from './auth-mongo.collections';
import { makeAudit, makeOutbox, toDocument } from './auth-mongo-admin.repository';
import { collection, withoutId } from './auth-mongo.util';
import { MongoClientToken, MongoDatabaseToken, runInMongoTransaction } from './mongo-runtime';

class RevisionConflict extends Error {}
class NotFound extends Error {}
class ValidationError extends Error {}
const MAX_BULK_ITEMS = 200;
const MAX_SNAPSHOT_BYTES = 32 * 1024;
const mapped = <T>(promise: Promise<T>): ResultAsync<T, ApiResponseStudioRepositoryError> =>
  ResultAsync.fromPromise(promise, (error) =>
    error instanceof RevisionConflict
      ? { code: 'revision_conflict', message: 'The API response changed after it was loaded. Refresh and try again.' }
      : error instanceof NotFound
        ? { code: 'not_found', message: 'The API Response Studio record was not found.' }
        : error instanceof ValidationError
          ? { code: 'validation_error', message: error.message }
          : {
              code: 'repository_error',
              message: error instanceof Error ? error.message : 'API Response Studio repository failed.',
            },
  );
const source = (value: Document & { _id: string }): ApiResponseStudioSourceRecord =>
  withoutId(value) as unknown as ApiResponseStudioSourceRecord;
const response = (value: Document & { _id: string }): ApiResponseStudioResponseRecord =>
  withoutId(value) as unknown as ApiResponseStudioResponseRecord;
const history = (value: Document & { _id: string }): ApiResponseStudioHistoryRecord =>
  withoutId(value) as unknown as ApiResponseStudioHistoryRecord;
const cleanObject = (value: unknown, depth = 0): unknown => {
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => cleanObject(item, depth + 1));
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
  const json = JSON.stringify(cleaned);
  return Buffer.byteLength(json, 'utf8') <= MAX_SNAPSHOT_BYTES
    ? ((cleaned as Record<string, unknown>) ?? {})
    : { truncated: true, bytes: Buffer.byteLength(json, 'utf8') };
};

@Injectable()
export class MongoApiResponseStudioRepository implements ApiResponseStudioRepositoryPort {
  constructor(
    @Inject(MongoDatabaseToken) private readonly database: Db,
    @Inject(MongoClientToken) private readonly client: MongoClient,
  ) {}
  dashboard(tenantId: string) {
    return mapped(
      Promise.all([
        this.sources().find({ tenantId }).sort({ name: 1 }).toArray(),
        this.rows().find({ tenantId }).toArray(),
      ]).then(([sources, rows]) => {
        const items = sources.map((item) => {
          const records = rows.filter((row) => row.sourceId === item._id);
          return {
            ...source(item),
            totalResponses: records.length,
            activeResponses: records.filter((row) => !row.deleted).length,
            newResponses: records.filter((row) => row.changeState === 'new' && !row.changeDismissed).length,
            modifiedResponses: records.filter((row) => row.changeState === 'modified' && !row.changeDismissed).length,
            deletedResponses: records.filter((row) => row.deleted && !row.changeDismissed).length,
            missingEn: records.filter((row) => !row.deleted && (row.texts?.en?.length ?? 0) === 0).length,
            missingRu: records.filter((row) => !row.deleted && (row.texts?.ru?.length ?? 0) === 0).length,
            missingZh: records.filter((row) => !row.deleted && (row.texts?.zh?.length ?? 0) === 0).length,
          };
        });
        return {
          sources: items,
          totals: {
            sources: sources.length,
            enabledSources: sources.filter((item) => item.enabled).length,
            responses: rows.filter((row) => !row.deleted).length,
            pendingChanges: rows.filter((row) => row.changeState !== 'unchanged' && !row.changeDismissed).length,
          },
        } satisfies ApiResponseStudioDashboard;
      }),
    );
  }
  listSources(tenantId: string) {
    return mapped(
      this.sources()
        .find({ tenantId })
        .sort({ name: 1 })
        .toArray()
        .then((rows) => rows.map(source)),
    );
  }
  findSource(tenantId: string, sourceId: string) {
    return mapped(
      this.sources()
        .findOne({ tenantId, _id: sourceId })
        .then((row) => (row ? source(row) : null)),
    );
  }
  createSource(input: CreateApiResponseStudioSourceInput) {
    return mapped(
      runInMongoTransaction(this.client, async (session) => {
        const now = new Date();
        const record: ApiResponseStudioSourceRecord = {
          id: randomUUID(),
          tenantId: input.tenantId,
          name: input.name.trim(),
          slug: input.slug.trim().toLowerCase(),
          jsonUrl: input.jsonUrl.trim(),
          docsUrl: input.docsUrl?.trim() ?? '',
          enabled: input.enabled ?? true,
          manualOnly: input.manualOnly ?? true,
          revision: 1,
          lastSyncAt: null,
          lastSyncStatus: 'never',
          lastSyncError: '',
          lastSyncSummary: null,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
          createdAt: now,
          updatedAt: now,
        };
        await this.sources().insertOne(toDocument(record), { session });
        await this.audit(session, {
          tenantId: input.tenantId,
          sourceId: record.id,
          action: 'admin.api_response_studio.source.create',
          actorUserId: input.actorUserId,
          before: {},
          after: record,
          metadata: input.metadata,
        });
        return record;
      }),
    );
  }
  updateSource(input: UpdateApiResponseStudioSourceInput) {
    return mapped(
      runInMongoTransaction(this.client, async (session) => {
        const before = await this.sources().findOne(
          { tenantId: input.tenantId, _id: input.id, revision: input.expectedRevision },
          { session },
        );
        if (!before) throw new RevisionConflict();
        const patch = Object.fromEntries(
          Object.entries({
            name: input.name?.trim(),
            slug: input.slug?.trim().toLowerCase(),
            jsonUrl: input.jsonUrl?.trim(),
            docsUrl: input.docsUrl?.trim(),
            enabled: input.enabled,
            manualOnly: input.manualOnly,
          }).filter(([, value]) => value !== undefined),
        );
        const after = await this.sources().findOneAndUpdate(
          { tenantId: input.tenantId, _id: input.id, revision: input.expectedRevision },
          { $set: { ...patch, updatedByUserId: input.actorUserId, updatedAt: new Date() }, $inc: { revision: 1 } },
          { session, returnDocument: 'after', includeResultMetadata: false },
        );
        if (!after) throw new RevisionConflict();
        await this.audit(session, {
          tenantId: input.tenantId,
          sourceId: input.id,
          action: 'admin.api_response_studio.source.update',
          actorUserId: input.actorUserId,
          before: source(before),
          after: source(after),
          metadata: input.metadata,
        });
        return source(after);
      }),
    );
  }
  listResponses(tenantId: string, query: ApiResponseStudioResponseQuery = {}) {
    return mapped(
      this.filteredRows(tenantId, query).then((rows) =>
        rows
          .slice(
            Math.max(0, query.offset ?? 0),
            Math.max(0, query.offset ?? 0) + Math.min(Math.max(1, query.limit ?? 100), 500),
          )
          .map(response),
      ),
    );
  }
  countResponses(tenantId: string, query: ApiResponseStudioResponseQuery = {}) {
    return mapped(this.filteredRows(tenantId, query).then((rows) => rows.length));
  }
  updateResponse(input: UpdateApiResponseStudioResponseInput) {
    return mapped(
      runInMongoTransaction(this.client, async (session) => {
        const before = await this.lockRow(input.tenantId, input.id, input.expectedRevision, session);
        const after = await this.rows().findOneAndUpdate(
          { tenantId: input.tenantId, _id: input.id, revision: input.expectedRevision },
          {
            $set: {
              display: input.display,
              severity: input.severity,
              support: input.support,
              customDescription: input.customDescription,
              figmaOnly: input.figmaOnly,
              comments: input.comments,
              texts: input.texts,
              updatedByUserId: input.actorUserId,
              updatedAt: new Date(),
            },
            $inc: { revision: 1 },
          },
          { session, returnDocument: 'after', includeResultMetadata: false },
        );
        if (!after) throw new RevisionConflict();
        await this.audit(session, {
          tenantId: input.tenantId,
          sourceId: after.sourceId,
          responseId: input.id,
          action: 'admin.api_response_studio.response.update',
          actorUserId: input.actorUserId,
          before: response(before),
          after: response(after),
          metadata: input.metadata,
        });
        return response(after);
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
    return mapped(
      runInMongoTransaction(this.client, async (session) => {
        const before = await this.lockRow(input.tenantId, input.id, input.expectedRevision, session);
        const after = await this.rows().findOneAndUpdate(
          { tenantId: input.tenantId, _id: input.id, revision: input.expectedRevision },
          {
            $set: {
              display: 'toast',
              severity: 'error',
              support: false,
              customDescription: '',
              figmaOnly: false,
              comments: '',
              texts: { en: [], ru: [], zh: [] },
              updatedByUserId: input.actorUserId,
              updatedAt: new Date(),
            },
            $inc: { revision: 1 },
          },
          { session, returnDocument: 'after', includeResultMetadata: false },
        );
        if (!after) throw new RevisionConflict();
        await this.audit(session, {
          tenantId: input.tenantId,
          sourceId: after.sourceId,
          responseId: input.id,
          action: 'admin.api_response_studio.response.reset',
          actorUserId: input.actorUserId,
          before: response(before),
          after: response(after),
          metadata: input.metadata,
        });
        return response(after);
      }),
    );
  }
  bulkUpdate(input: BulkUpdateApiResponseStudioResponseInput) {
    return mapped(
      this.withBoundedItems(input.items, 'Bulk update', (items) =>
        runInMongoTransaction(this.client, async (session) => {
          const before = await this.lockRows(input.tenantId, items, session);
          const after: ApiResponseStudioResponseRecord[] = [];
          for (const item of before) {
            const updated = await this.rows().findOneAndUpdate(
              { tenantId: input.tenantId, _id: item._id, revision: item.revision },
              {
                $set: { ...input.patch, updatedByUserId: input.actorUserId, updatedAt: new Date() },
                $inc: { revision: 1 },
              },
              { session, returnDocument: 'after', includeResultMetadata: false },
            );
            if (!updated) throw new RevisionConflict();
            after.push(response(updated));
          }
          await this.audit(session, {
            tenantId: input.tenantId,
            sourceId: before[0]?.sourceId ?? null,
            action: 'admin.api_response_studio.response.bulk_update',
            actorUserId: input.actorUserId,
            before: { rows: before.map(response) },
            after: { rows: after },
            metadata: input.metadata,
          });
          return after;
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
    return mapped(
      this.withBoundedItems(input.items, 'Dismiss', (items) =>
        runInMongoTransaction(this.client, async (session) => {
          const before = await this.lockRows(input.tenantId, items, session);
          const after: ApiResponseStudioResponseRecord[] = [];
          for (const item of before) {
            const updated = await this.rows().findOneAndUpdate(
              { tenantId: input.tenantId, _id: item._id, revision: item.revision },
              {
                $set: { changeDismissed: true, updatedByUserId: input.actorUserId, updatedAt: new Date() },
                $inc: { revision: 1 },
              },
              { session, returnDocument: 'after', includeResultMetadata: false },
            );
            if (!updated) throw new RevisionConflict();
            after.push(response(updated));
          }
          await this.audit(session, {
            tenantId: input.tenantId,
            sourceId: before[0]?.sourceId ?? null,
            action: 'admin.api_response_studio.change.dismiss',
            actorUserId: input.actorUserId,
            before: { rows: before.map(response) },
            after: { rows: after },
            metadata: input.metadata,
          });
          return after;
        }),
      ),
    );
  }
  sync(input: SyncApiResponseStudioSourceInput) {
    return mapped(
      runInMongoTransaction(this.client, async (session) => {
        const sourceBefore = await this.sources().findOne(
          { tenantId: input.tenantId, _id: input.sourceId, revision: input.expectedRevision },
          { session },
        );
        if (!sourceBefore) throw new RevisionConflict();
        const existing = await this.rows()
          .find({ tenantId: input.tenantId, sourceId: input.sourceId }, { session })
          .toArray();
        const byKey = new Map(existing.map((item) => [item.stableKey, item]));
        const incoming = new Set(input.variants.map((item) => item.stableKey));
        const summary = { created: 0, modified: 0, deleted: 0, unchanged: 0 };
        const now = input.syncedAt ?? new Date();
        for (const variant of input.variants) {
          const item = byKey.get(variant.stableKey);
          if (!item) {
            await this.rows().insertOne(
              toDocument({
                id: randomUUID(),
                tenantId: input.tenantId,
                sourceId: input.sourceId,
                ...variant,
                changeState: 'new',
                changeDismissed: false,
                deleted: false,
                display: 'toast',
                severity: 'error',
                support: false,
                customDescription: '',
                figmaOnly: false,
                comments: '',
                texts: { en: [], ru: [], zh: [] },
                revision: 1,
                updatedByUserId: input.actorUserId,
                createdAt: now,
                updatedAt: now,
              }),
              { session },
            );
            summary.created += 1;
          } else if (item.sourceFingerprint !== variant.sourceFingerprint || item.deleted) {
            await this.rows().updateOne(
              { tenantId: input.tenantId, _id: item._id, revision: item.revision },
              {
                $set: {
                  ...variant,
                  deleted: false,
                  changeState: item.deleted ? 'new' : 'modified',
                  changeDismissed: false,
                  updatedByUserId: input.actorUserId,
                  updatedAt: now,
                },
                $inc: { revision: 1 },
              },
              { session },
            );
            summary.modified += 1;
          } else summary.unchanged += 1;
        }
        for (const item of existing)
          if (!incoming.has(item.stableKey) && !item.deleted) {
            await this.rows().updateOne(
              { tenantId: input.tenantId, _id: item._id, revision: item.revision },
              {
                $set: {
                  deleted: true,
                  changeState: 'deleted',
                  changeDismissed: false,
                  updatedByUserId: input.actorUserId,
                  updatedAt: now,
                },
                $inc: { revision: 1 },
              },
              { session },
            );
            summary.deleted += 1;
          }
        const changed = summary.created + summary.modified + summary.deleted > 0;
        const after = await this.sources().findOneAndUpdate(
          { tenantId: input.tenantId, _id: input.sourceId, revision: input.expectedRevision },
          {
            $set: {
              lastSyncAt: now,
              lastSyncStatus: 'success',
              lastSyncError: '',
              lastSyncSummary: summary,
              updatedByUserId: input.actorUserId,
              updatedAt: now,
            },
            ...(changed ? { $inc: { revision: 1 } } : {}),
          },
          { session, returnDocument: 'after', includeResultMetadata: false },
        );
        if (!after) throw new RevisionConflict();
        await this.audit(session, {
          tenantId: input.tenantId,
          sourceId: input.sourceId,
          action: 'admin.api_response_studio.sync',
          actorUserId: input.actorUserId,
          before: {},
          after: { summary },
          metadata: input.metadata,
        });
        return { source: source(after), summary };
      }),
    );
  }
  history(tenantId: string, query: ApiResponseStudioHistoryQuery = {}) {
    return mapped(
      this.historyRows()
        .find({ tenantId })
        .sort({ createdAt: -1 })
        .toArray()
        .then((rows) =>
          rows
            .filter((item) => !query.sourceId || item.sourceId === query.sourceId)
            .filter((item) => !query.responseId || item.responseId === query.responseId)
            .filter((item) => !query.action || item.action === query.action)
            .filter((item) => !query.actorUserId || item.actorUserId === query.actorUserId)
            .filter((item) => !query.createdFrom || item.createdAt >= query.createdFrom)
            .filter((item) => !query.createdTo || item.createdAt <= query.createdTo)
            .slice(
              Math.max(0, query.offset ?? 0),
              Math.max(0, query.offset ?? 0) + Math.min(Math.max(1, query.limit ?? 100), 500),
            )
            .map(history),
        ),
    );
  }
  private sources() {
    return collection(this.database, AuthMongoCollections.apiResponseSources);
  }
  private rows() {
    return collection(this.database, AuthMongoCollections.apiResponseRows);
  }
  private historyRows() {
    return collection(this.database, AuthMongoCollections.apiResponseHistory);
  }
  private async filteredRows(tenantId: string, query: ApiResponseStudioResponseQuery) {
    const rows = await this.rows()
      .find({ tenantId })
      .sort({ sourceId: 1, tag: 1, path: 1, method: 1, status: 1, stableKey: 1 })
      .toArray();
    const search = query.search?.trim().toLowerCase();
    return rows
      .filter((item) => query.includeDeleted || !item.deleted)
      .filter((item) => !query.sourceId || item.sourceId === query.sourceId)
      .filter((item) => !query.exact || item.stableKey === query.exact)
      .filter((item) => !query.status || item.status === query.status)
      .filter((item) => !query.method || item.method === query.method.toUpperCase())
      .filter((item) => !query.display || item.display === query.display)
      .filter((item) => !query.changeState || item.changeState === query.changeState)
      .filter((item) => !query.missingLanguage || (item.texts?.[query.missingLanguage]?.length ?? 0) === 0)
      .filter(
        (item) =>
          !search ||
          [item.stableKey, item.tag, item.path, item.operationId, item.summary, item.errorType, item.description].some(
            (value) => String(value).toLowerCase().includes(search),
          ),
      );
  }
  private async lockRow(tenantId: string, id: string, revision: number, session: ClientSession) {
    const item = await this.rows().findOne({ tenantId, _id: id, revision }, { session });
    if (!item) throw new RevisionConflict();
    return item;
  }
  private withBoundedItems<T>(
    items: ReadonlyArray<{ id: string; expectedRevision: number }>,
    operation: string,
    run: (items: ReadonlyArray<{ id: string; expectedRevision: number }>) => Promise<T>,
  ): Promise<T> {
    if (items.length === 0 || items.length > MAX_BULK_ITEMS) {
      return Promise.reject(new ValidationError(`${operation} requires between 1 and 200 rows.`));
    }
    return run(items);
  }
  private async lockRows(
    tenantId: string,
    items: ReadonlyArray<{ id: string; expectedRevision: number }>,
    session: ClientSession,
  ) {
    const unique = new Map(items.map((item) => [item.id, item.expectedRevision]));
    if (unique.size !== items.length) throw new RevisionConflict();
    const rows = await this.rows()
      .find({ tenantId, _id: { $in: [...unique.keys()] } }, { session })
      .sort({ _id: 1 })
      .toArray();
    if (rows.length !== items.length || rows.some((item) => item.revision !== unique.get(item._id)))
      throw new RevisionConflict();
    return rows;
  }
  private async audit(
    session: ClientSession,
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
    const item: ApiResponseStudioHistoryRecord = {
      id: randomUUID(),
      tenantId: input.tenantId,
      sourceId: input.sourceId ?? null,
      responseId: input.responseId ?? null,
      action: input.action,
      actorUserId: input.actorUserId,
      before: bounded(input.before),
      after: bounded(input.after),
      metadata: bounded(input.metadata ?? {}),
      createdAt: new Date(),
    };
    const audit = makeAudit({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action as AdminAuditAction,
      resource: 'admin.settings.api_response_studio',
      before: item.before,
      after: item.after,
      metadata: { historyId: item.id, sourceId: item.sourceId, responseId: item.responseId, ...item.metadata },
    });
    const outbox = makeOutbox(audit, 'api-response-studio', item.id);
    await this.historyRows().insertOne(toDocument(item), { session });
    await collection(this.database, AuthMongoCollections.auditLogs).insertOne(toDocument(audit), { session });
    await collection(this.database, AuthMongoCollections.outbox).insertOne(toDocument(outbox), { session });
  }
}
