/* eslint-disable sonarjs/no-nested-conditional, @typescript-eslint/no-restricted-types -- In-memory transactional test doubles intentionally mirror MikroORM object APIs. */
// @requirements REQ-API-RESPONSE-STUDIO-003
// @requirements REQ-API-RESPONSE-STUDIO-004
import type { EntityManager } from '@mikro-orm/core';
import type { ApiResponseStudioParsedVariant } from '@app/backend-feature-auth-shared';
import type { ResultAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import {
  AdminAuditLogEntity,
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
  readonly failFlush?: boolean;
}

const createEntityManager = (options: ManagerOptions = {}) => {
  const sources = options.sources ?? [source()];
  const responses = options.responses ?? [];
  const persisted: unknown[] = [];
  const find = vi.fn((entity: unknown, where: Record<string, unknown>) => {
    const rows = entity === ApiResponseStudioSourceEntity ? sources : responses;
    return Promise.resolve(
      rows.filter(
        (row) =>
          (!where['tenantId'] || row.tenantId === where['tenantId']) &&
          (!where['sourceId'] || ('sourceId' in row && row.sourceId === where['sourceId'])),
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
  const transactional = vi.fn(<T>(callback: (em: typeof transaction) => Promise<T>): Promise<T> => callback(transaction));
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

    const preserved = await unwrap(
      repository.updateResponse({ ...presentation, expectedRevision: updated.revision }),
    );
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
