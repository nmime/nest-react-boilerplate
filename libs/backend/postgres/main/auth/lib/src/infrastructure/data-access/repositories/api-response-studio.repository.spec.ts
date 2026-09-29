/* eslint-disable sonarjs/no-nested-conditional, @typescript-eslint/no-restricted-types -- In-memory transactional test doubles intentionally mirror MikroORM object APIs. */
// @requirements REQ-API-RESPONSE-STUDIO-003
// @requirements REQ-API-RESPONSE-STUDIO-004
import type { EntityManager } from '@mikro-orm/core';
import type { ApiResponseStudioParsedVariant } from '@app/backend-feature-auth-shared';
import type { ResultAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import {
  AdminAuditLogEntity,
  ApiResponseStudioHistoryEntity,
  ApiResponseStudioResponseEntity,
  ApiResponseStudioSourceEntity,
  TransactionalOutboxEventEntity,
} from '../entities';
import { ApiResponseStudioRepository } from './api-response-studio.repository';

const tenantA = '00000000-0000-4000-8000-000000000010';
const tenantB = '00000000-0000-4000-8000-000000000011';
const actorUserId = '00000000-0000-4000-8000-000000000012';
const sourceId = '00000000-0000-4000-8000-000000000013';
const at = new Date('2026-08-28T10:00:00.000Z');

const variant = (
  stableKey: string,
  status: ApiResponseStudioParsedVariant['status'],
  sourceFingerprint = `fingerprint-${status}`,
): ApiResponseStudioParsedVariant => ({
  stableKey,
  tag: 'Payments',
  method: 'POST',
  path: '/payments',
  operationId: 'createPayment',
  summary: 'Creates a payment',
  status,
  errorType: status === 'ERR' ? 'Error' : status === 'NET' ? 'NetworkError' : 'ValidationError',
  description: `${status} response`,
  schemaSnapshot: `schema-${status}`,
  exampleSnapshot: `example-${status}`,
  enumChoices: [{ property: 'reason', values: ['A', 'B'], enabledValues: ['A'] }],
  sourceFingerprint,
});

const source = (tenantId = tenantA) =>
  Object.assign(new ApiResponseStudioSourceEntity(), {
    id: sourceId,
    tenantId,
    name: 'Payments',
    slug: 'payments',
    jsonUrl: 'https://example.com/openapi.json',
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    createdAt: at,
    updatedAt: at,
  });

const response = (
  id: string,
  input: ApiResponseStudioParsedVariant,
  overrides: Partial<ApiResponseStudioResponseEntity> = {},
) =>
  Object.assign(new ApiResponseStudioResponseEntity(), {
    id,
    tenantId: tenantA,
    sourceId,
    ...input,
    display: 'modal',
    severity: 'warning',
    support: true,
    customDescription: 'Contact support',
    figmaOnly: true,
    comments: 'Keep this presentation',
    texts: { en: ['English'], ru: ['Русский'], zh: ['中文'] },
    revision: 4,
    updatedByUserId: actorUserId,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  });

interface ManagerOptions {
  readonly sources?: ApiResponseStudioSourceEntity[];
  readonly responses?: ApiResponseStudioResponseEntity[];
  readonly history?: ApiResponseStudioHistoryEntity[];
  readonly failFlush?: boolean;
}

const createEntityManager = (options: ManagerOptions = {}) => {
  const sources = options.sources ?? [source()];
  const responses = options.responses ?? [];
  const persisted: unknown[] = [];
  const rowsByEntity = new Map<
    unknown,
    Array<ApiResponseStudioSourceEntity | ApiResponseStudioResponseEntity | ApiResponseStudioHistoryEntity>
  >([
    [ApiResponseStudioSourceEntity, sources],
    [ApiResponseStudioResponseEntity, responses],
    [ApiResponseStudioHistoryEntity, options.history ?? []],
  ]);
  const find = vi.fn((entity: unknown, where: { tenantId?: string; sourceId?: string; id?: { $in: string[] } }) => {
    const rows = rowsByEntity.get(entity) ?? [];
    return Promise.resolve(
      rows.filter(
        (row) =>
          (!where['tenantId'] || row.tenantId === where['tenantId']) &&
          (!where['sourceId'] || ('sourceId' in row && row.sourceId === where['sourceId'])) &&
          (!where['id'] || where['id'].$in.includes(row.id)),
      ),
    );
  });
  const findOne = vi.fn((entity: unknown, where: Record<string, unknown>) => {
    const rows = entity === ApiResponseStudioSourceEntity ? sources : responses;
    return Promise.resolve(
      rows.find(
        (row) => (!where['tenantId'] || row.tenantId === where['tenantId']) && (!where['id'] || row.id === where['id']),
      ) ?? null,
    );
  });
  const persist = vi.fn((value: unknown) => {
    persisted.push(...(Array.isArray(value) ? value : [value]));
  });
  const flush = vi.fn(() => (options.failFlush ? Promise.reject(new Error('flush failed')) : Promise.resolve()));
  const transaction = { find, findOne, persist, flush };
  const transactional = vi.fn(<T>(callback: (em: typeof transaction) => Promise<T>): Promise<T> =>
    callback(transaction),
  );
  const entityManager = { find, findOne, transactional } as unknown as EntityManager;
  return { entityManager, find, findOne, flush, persisted, transactional };
};

const unwrap = async <T, E extends { message: string }>(result: ResultAsync<T, E>): Promise<T> => {
  const settled = await result;
  if (settled.isErr()) {
    throw new Error(settled.error.message);
  }
  return settled.value;
};

const sync = (
  repository: ApiResponseStudioRepository,
  variants: ApiResponseStudioParsedVariant[],
  expectedRevision = 1,
) =>
  repository.sync({
    tenantId: tenantA,
    sourceId,
    expectedRevision,
    variants,
    actorUserId,
    syncedAt: at,
    metadata: { authorization: 'Bearer secret', requestId: 'request-1' },
  });

describe('ApiResponseStudioRepository', () => {
  it('creates sources with normalized defaults and updates explicit false values under a revision lock', async () => {
    const manager = createEntityManager();
    const repository = new ApiResponseStudioRepository(manager.entityManager);
    const created = await unwrap(
      repository.createSource({
        tenantId: tenantA,
        actorUserId,
        name: ' Name ',
        slug: ' NAME ',
        jsonUrl: ' https://example.com/spec ',
      }),
    );
    expect(created).toMatchObject({
      name: 'Name',
      slug: 'name',
      jsonUrl: 'https://example.com/spec',
      docsUrl: '',
      enabled: true,
      manualOnly: true,
    });
    const explicit = await unwrap(
      repository.createSource({
        tenantId: tenantA,
        actorUserId,
        name: 'Explicit',
        slug: 'explicit',
        jsonUrl: 'https://example.com/spec',
        docsUrl: ' https://example.com/docs ',
        enabled: false,
        manualOnly: false,
      }),
    );
    expect(explicit).toMatchObject({ enabled: false, manualOnly: false, docsUrl: 'https://example.com/docs' });
    const updated = await unwrap(
      repository.updateSource({
        tenantId: tenantA,
        id: sourceId,
        expectedRevision: 1,
        actorUserId,
        name: ' Updated ',
        slug: ' UPDATED ',
        jsonUrl: ' https://example.com/new ',
        docsUrl: ' https://example.com/new-docs ',
        enabled: false,
        manualOnly: false,
      }),
    );
    expect(updated).toMatchObject({ name: 'Updated', slug: 'updated', enabled: false, manualOnly: false, revision: 2 });
    const unchangedFields = await unwrap(
      repository.updateSource({ tenantId: tenantA, id: sourceId, expectedRevision: 2, actorUserId }),
    );
    expect(unchangedFields).toMatchObject({ name: 'Updated', enabled: false, manualOnly: false, revision: 3 });
    expect(manager.flush).toHaveBeenCalledTimes(4);
    expect(manager.persisted.filter((row) => row instanceof TransactionalOutboxEventEntity)).toHaveLength(4);
  });

  it('refuses missing or cross-tenant sources and stale source writes', async () => {
    const manager = createEntityManager();
    const repository = new ApiResponseStudioRepository(manager.entityManager);
    expect(await unwrap(repository.findSource(tenantA, sourceId))).toMatchObject({ tenantId: tenantA });
    expect(await unwrap(repository.findSource(tenantB, sourceId))).toBeNull();
    const missing = await repository.updateSource({
      tenantId: tenantB,
      id: sourceId,
      expectedRevision: 1,
      actorUserId,
    });
    expect(missing._unsafeUnwrapErr().code).toBe('not_found');
    const stale = await repository.updateSource({ tenantId: tenantA, id: sourceId, expectedRevision: 2, actorUserId });
    expect(stale._unsafeUnwrapErr().code).toBe('revision_conflict');
    const missingSync = await repository.sync({
      tenantId: tenantB,
      sourceId,
      expectedRevision: 1,
      variants: [],
      actorUserId,
    });
    expect(missingSync._unsafeUnwrapErr().code).toBe('not_found');
    expect((await sync(repository, [], 2))._unsafeUnwrapErr().code).toBe('revision_conflict');
    expect(manager.persisted).toHaveLength(0);
  });

  it('summarizes active translations and pending changes without counting dismissed changes', async () => {
    const rows = [
      response('new', variant('new', '400'), { changeState: 'new', texts: { en: [], ru: [], zh: [] } }),
      response('modified', variant('modified', 'ERR'), { changeState: 'modified' }),
      response('deleted', variant('deleted', 'NET'), { deleted: true, changeState: 'deleted' }),
      response('dismissed', variant('dismissed', '400'), { changeState: 'new', changeDismissed: true }),
    ];
    const repository = new ApiResponseStudioRepository(createEntityManager({ responses: rows }).entityManager);
    const dashboard = await unwrap(repository.dashboard(tenantA));
    expect(dashboard.totals).toEqual({ sources: 1, enabledSources: 1, responses: 3, pendingChanges: 3 });
    expect(dashboard.sources[0]).toMatchObject({
      totalResponses: 4,
      activeResponses: 3,
      newResponses: 1,
      modifiedResponses: 1,
      deletedResponses: 1,
      missingEn: 1,
      missingRu: 1,
      missingZh: 1,
    });
  });

  it('filters tenant-scoped responses and bounds pagination consistently with count', async () => {
    const rows = [
      response('match', variant('match', '400'), { changeState: 'new', texts: { en: [], ru: [], zh: [] } }),
      response('other', variant('other', 'NET'), {
        sourceId: 'other-source',
        display: 'toast',
        changeState: 'modified',
      }),
      response('deleted', variant('deleted', 'ERR'), { deleted: true }),
      response('foreign', variant('foreign', '400'), { tenantId: tenantB }),
    ];
    const repository = new ApiResponseStudioRepository(createEntityManager({ responses: rows }).entityManager);
    const query = {
      sourceId,
      exact: 'match',
      status: '400' as const,
      method: 'post',
      display: 'modal' as const,
      changeState: 'new' as const,
      missingLanguage: 'en' as const,
      search: ' Payments ',
      offset: -2,
      limit: 0,
    };
    expect((await unwrap(repository.listResponses(tenantA, query))).map((row) => row.id)).toEqual(['match']);
    expect(await unwrap(repository.countResponses(tenantA, query))).toBe(1);
    expect(await unwrap(repository.countResponses(tenantA, { includeDeleted: true }))).toBe(3);
    expect(await unwrap(repository.countResponses(tenantA, { search: 'nonexistent' }))).toBe(0);
    expect(
      (await unwrap(repository.listResponses(tenantA, { includeDeleted: true, offset: 1, limit: 900 }))).map(
        (row) => row.id,
      ),
    ).toEqual(['other', 'deleted']);
  });

  it('resets presentation data and dismisses changes while preserving source response identity', async () => {
    const row = response('reset', variant('reset', '400'));
    const manager = createEntityManager({ responses: [row] });
    const repository = new ApiResponseStudioRepository(manager.entityManager);
    const reset = await unwrap(
      repository.resetResponse({ tenantId: tenantA, id: row.id, expectedRevision: 4, actorUserId }),
    );
    expect(reset).toMatchObject({
      display: 'toast',
      severity: 'error',
      support: false,
      customDescription: '',
      figmaOnly: false,
      comments: '',
      texts: { en: [], ru: [], zh: [] },
      revision: 5,
      stableKey: 'reset',
    });
    const dismissed = await unwrap(
      repository.dismissChanges({ tenantId: tenantA, items: [{ id: row.id, expectedRevision: 5 }], actorUserId }),
    );
    expect(dismissed[0]).toMatchObject({ changeDismissed: true, revision: 6 });
    expect(manager.persisted.filter((item) => item instanceof ApiResponseStudioHistoryEntity)).toHaveLength(2);
    expect(
      (
        await repository.resetResponse({ tenantId: tenantB, id: row.id, expectedRevision: 6, actorUserId })
      )._unsafeUnwrapErr().code,
    ).toBe('not_found');
  });

  it('applies complete and partial bulk patches only to requested rows', async () => {
    const first = response('first', variant('first', '400'));
    const second = response('second', variant('second', 'NET'));
    const manager = createEntityManager({ responses: [first, second] });
    const repository = new ApiResponseStudioRepository(manager.entityManager);
    const updated = await unwrap(
      repository.bulkUpdate({
        tenantId: tenantA,
        items: [{ id: first.id, expectedRevision: 4 }],
        actorUserId,
        patch: {
          display: 'custom',
          severity: 'info',
          support: false,
          customDescription: 'Bulk',
          figmaOnly: false,
          comments: 'Changed',
          texts: { en: ['Bulk'], ru: [], zh: [] },
        },
      }),
    );
    expect(updated[0]).toMatchObject({
      display: 'custom',
      severity: 'info',
      support: false,
      revision: 5,
      texts: { en: ['Bulk'], ru: [], zh: [] },
    });
    expect(second.revision).toBe(4);
    await unwrap(
      repository.bulkUpdate({
        tenantId: tenantA,
        items: [{ id: first.id, expectedRevision: 5 }],
        actorUserId,
        patch: {},
      }),
    );
    expect(first).toMatchObject({ customDescription: 'Bulk', comments: 'Changed', revision: 6 });
    expect(
      (
        await repository.bulkUpdate({
          tenantId: tenantA,
          items: [{ id: 'missing', expectedRevision: 1 }],
          actorUserId,
          patch: {},
        })
      )._unsafeUnwrapErr().code,
    ).toBe('revision_conflict');
  });

  it('records newly discovered and modified responses and skips already deleted records', async () => {
    const existing = response('existing', variant('existing', '400'));
    const deleted = response('deleted', variant('deleted', 'NET'), { deleted: true });
    const manager = createEntityManager({ responses: [existing, deleted] });
    const repository = new ApiResponseStudioRepository(manager.entityManager);
    const settled = await unwrap(
      repository.sync({
        tenantId: tenantA,
        sourceId,
        expectedRevision: 1,
        actorUserId,
        variants: [variant('existing', '400', 'changed'), variant('new', 'ERR')],
      }),
    );
    expect(settled.summary).toEqual({ created: 1, modified: 1, deleted: 0, unchanged: 0 });
    expect(existing).toMatchObject({ changeState: 'modified', revision: 5 });
    expect(deleted.revision).toBe(4);
    expect(manager.persisted.find((row) => row instanceof ApiResponseStudioResponseEntity)).toMatchObject({
      stableKey: 'new',
      tenantId: tenantA,
    });
  });

  it('filters mutation history by owner, response, action and inclusive time bounds', async () => {
    const entry = Object.assign(new ApiResponseStudioHistoryEntity(), {
      tenantId: tenantA,
      sourceId,
      responseId: 'response',
      action: 'update',
      actorUserId,
      createdAt: at,
    });
    const foreign = Object.assign(new ApiResponseStudioHistoryEntity(), { ...entry, tenantId: tenantB });
    const repository = new ApiResponseStudioRepository(
      createEntityManager({ history: [entry, foreign] }).entityManager,
    );
    expect(
      await unwrap(
        repository.history(tenantA, {
          sourceId,
          responseId: 'response',
          action: 'update',
          actorUserId,
          createdFrom: at,
          createdTo: at,
          offset: -1,
          limit: 0,
        }),
      ),
    ).toHaveLength(1);
    for (const query of [
      { sourceId: 'other' },
      { responseId: 'other' },
      { action: 'other' },
      { actorUserId: 'other' },
      { createdFrom: new Date(at.getTime() + 1) },
      { createdTo: new Date(at.getTime() - 1) },
    ]) {
      expect(await unwrap(repository.history(tenantA, query))).toEqual([]);
    }
  });

  it('reports failed transaction flushes without returning a successful mutation', async () => {
    const manager = createEntityManager({ failFlush: true });
    const repository = new ApiResponseStudioRepository(manager.entityManager);
    expect(
      (
        await repository.createSource({
          tenantId: tenantA,
          actorUserId,
          name: 'Fail',
          slug: 'fail',
          jsonUrl: 'https://example.com/spec',
        })
      )._unsafeUnwrapErr(),
    ).toMatchObject({ code: 'repository_error', message: 'flush failed' });
  });
  it('scopes every source and response read by tenant identity', async () => {
    const manager = createEntityManager({
      sources: [source(tenantA), Object.assign(source(tenantB), { id: '00000000-0000-4000-8000-000000000099' })],
      responses: [response('00000000-0000-4000-8000-000000000020', variant('a', '400'))],
    });
    const repository = new ApiResponseStudioRepository(manager.entityManager);

    await unwrap(repository.listSources(tenantA));
    await unwrap(repository.listResponses(tenantA));
    await unwrap(repository.history(tenantA));

    expect(manager.find.mock.calls.map((call) => call[1])).toEqual(
      expect.arrayContaining([expect.objectContaining({ tenantId: tenantA })]),
    );
    expect(manager.find.mock.calls.every((call) => (call[1] as { tenantId?: string }).tenantId === tenantA)).toBe(true);
  });

  it('keeps repeated unchanged sync idempotent and preserves presentation configuration', async () => {
    const current = response('00000000-0000-4000-8000-000000000020', variant('ERR-key', 'ERR'));
    const manager = createEntityManager({ responses: [current] });
    const repository = new ApiResponseStudioRepository(manager.entityManager);

    const result = await unwrap(sync(repository, [variant('ERR-key', 'ERR')]));

    expect(result.summary).toEqual({ created: 0, modified: 0, deleted: 0, unchanged: 1 });
    expect(result.source.revision).toBe(1);
    expect(current).toMatchObject({
      revision: 4,
      display: 'modal',
      severity: 'warning',
      support: true,
      customDescription: 'Contact support',
      figmaOnly: true,
      comments: 'Keep this presentation',
      texts: { en: ['English'], ru: ['Русский'], zh: ['中文'] },
    });
  });

  it('soft-deletes and revives ERR/NET rows while preserving user presentation data', async () => {
    const err = response('00000000-0000-4000-8000-000000000021', variant('ERR-key', 'ERR'));
    const net = response('00000000-0000-4000-8000-000000000022', variant('NET-key', 'NET'), { deleted: true });
    const manager = createEntityManager({ responses: [err, net] });
    const repository = new ApiResponseStudioRepository(manager.entityManager);

    const result = await unwrap(sync(repository, [variant('NET-key', 'NET', 'fingerprint-NET-v2')]));

    expect(result.summary).toEqual({ created: 0, modified: 1, deleted: 1, unchanged: 0 });
    expect(err).toMatchObject({ deleted: true, changeState: 'deleted', revision: 5 });
    expect(net).toMatchObject({
      deleted: false,
      changeState: 'new',
      revision: 5,
      display: 'modal',
      severity: 'warning',
      support: true,
      customDescription: 'Contact support',
      figmaOnly: true,
      comments: 'Keep this presentation',
      texts: { en: ['English'], ru: ['Русский'], zh: ['中文'] },
    });
  });

  it('rejects stale optimistic revisions without persisting audit, outbox, or history', async () => {
    const row = response('00000000-0000-4000-8000-000000000023', variant('400-key', '400'));
    const manager = createEntityManager({ responses: [row] });
    const repository = new ApiResponseStudioRepository(manager.entityManager);

    const error = await repository
      .updateResponse({
        tenantId: tenantA,
        id: row.id,
        expectedRevision: 3,
        actorUserId,
        display: 'toast',
        severity: 'error',
        support: false,
        customDescription: '',
        figmaOnly: false,
        comments: '',
        texts: { en: [], ru: [], zh: [] },
      })
      .then((value) => value._unsafeUnwrapErr());

    expect(error).toMatchObject({ code: 'revision_conflict' });
    expect(manager.persisted).toHaveLength(0);
    expect(manager.flush).not.toHaveBeenCalled();
    expect(row.revision).toBe(4);
  });

  it('updates persisted enum choices atomically and preserves them when an older client omits the field', async () => {
    const row = response('00000000-0000-4000-8000-000000000029', variant('enum-choice', '400'));
    const manager = createEntityManager({ responses: [row] });
    const repository = new ApiResponseStudioRepository(manager.entityManager);
    const presentation = {
      tenantId: tenantA,
      id: row.id,
      actorUserId,
      display: 'toast' as const,
      severity: 'warning' as const,
      support: false,
      customDescription: '',
      figmaOnly: false,
      comments: 'enum selection',
      texts: { en: ['English'], ru: ['Русский'], zh: ['中文'] },
    };

    const updated = await unwrap(
      repository.updateResponse({
        ...presentation,
        expectedRevision: row.revision,
        enumChoices: [{ property: 'reason', values: ['A', 'B'], enabledValues: ['B', 'unknown'] }],
      }),
    );
    expect(updated.enumChoices).toEqual([{ property: 'reason', values: ['A', 'B'], enabledValues: ['B'] }]);

    const preserved = await unwrap(repository.updateResponse({ ...presentation, expectedRevision: updated.revision }));
    expect(preserved.enumChoices).toEqual(updated.enumChoices);
  });

  it('validates bounded bulk input before opening a transaction and rejects duplicate or stale rows atomically', async () => {
    const first = response('00000000-0000-4000-8000-000000000024', variant('first', '400'));
    const second = response('00000000-0000-4000-8000-000000000025', variant('second', 'NET'));
    const manager = createEntityManager({ responses: [first, second] });
    const repository = new ApiResponseStudioRepository(manager.entityManager);
    const patch = { severity: 'info' as const };

    await expect(
      repository
        .bulkUpdate({ tenantId: tenantA, items: [], patch, actorUserId })
        .then((value) => value._unsafeUnwrapErr()),
    ).resolves.toMatchObject({ code: 'validation_error' });
    await expect(
      repository
        .bulkUpdate({
          tenantId: tenantA,
          items: Array.from({ length: 201 }, (_, index) => ({ id: `row-${index}`, expectedRevision: 1 })),
          patch,
          actorUserId,
        })
        .then((value) => value._unsafeUnwrapErr()),
    ).resolves.toMatchObject({ code: 'validation_error' });
    expect(manager.transactional).not.toHaveBeenCalled();

    const duplicate = await repository
      .bulkUpdate({
        tenantId: tenantA,
        items: [
          { id: first.id, expectedRevision: first.revision },
          { id: first.id, expectedRevision: first.revision },
        ],
        patch,
        actorUserId,
      })
      .then((value) => value._unsafeUnwrapErr());
    expect(duplicate).toMatchObject({ code: 'revision_conflict' });

    const stale = await repository
      .bulkUpdate({
        tenantId: tenantA,
        items: [
          { id: first.id, expectedRevision: first.revision },
          { id: second.id, expectedRevision: second.revision - 1 },
        ],
        patch,
        actorUserId,
      })
      .then((value) => value._unsafeUnwrapErr());
    expect(stale).toMatchObject({ code: 'revision_conflict' });
    expect(first.severity).toBe('warning');
    expect(second.severity).toBe('warning');
    expect(manager.persisted).toHaveLength(0);
    expect(manager.flush).not.toHaveBeenCalled();
  });

  it('persists bounded redacted history, audit and outbox snapshots in the mutation transaction', async () => {
    const row = response('00000000-0000-4000-8000-000000000026', variant('audit', 'ERR'));
    const manager = createEntityManager({ responses: [row] });
    const repository = new ApiResponseStudioRepository(manager.entityManager);

    await repository
      .updateResponse({
        tenantId: tenantA,
        id: row.id,
        expectedRevision: row.revision,
        actorUserId,
        display: 'custom',
        severity: 'info',
        support: true,
        customDescription: 'A'.repeat(40_000),
        figmaOnly: false,
        comments: 'Updated',
        texts: { en: ['Updated'], ru: ['Обновлено'], zh: ['已更新'] },
        metadata: { authorization: 'Bearer secret', password: 'hidden', requestId: 'request-2' },
      })
      .then((value) => value._unsafeUnwrap());

    const history = manager.persisted.find(
      (
        item,
      ): item is {
        before: Record<string, unknown>;
        after: Record<string, unknown>;
        metadata: Record<string, unknown>;
      } =>
        'action' in (item as object) &&
        (item as { action?: string }).action === 'admin.api_response_studio.response.update' &&
        !('resource' in (item as object)),
    );
    const audit = manager.persisted.find((item): item is AdminAuditLogEntity => item instanceof AdminAuditLogEntity);
    const outbox = manager.persisted.find(
      (item): item is TransactionalOutboxEventEntity => item instanceof TransactionalOutboxEventEntity,
    );

    expect(history).toBeDefined();
    expect(audit).toBeDefined();
    expect(outbox).toBeDefined();
    expect(history?.metadata).toMatchObject({
      authorization: '[redacted]',
      password: '[redacted]',
      requestId: 'request-2',
    });
    expect(Buffer.byteLength(JSON.stringify(history?.after), 'utf8')).toBeLessThanOrEqual(32 * 1024);
    expect(audit?.before).toEqual(history?.before);
    expect(outbox?.payload).toMatchObject({ before: history?.before, after: history?.after });
    expect(manager.flush).toHaveBeenCalledTimes(1);
  });
});
