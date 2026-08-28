// @requirements REQ-API-RESPONSE-STUDIO-003
// @requirements REQ-API-RESPONSE-STUDIO-004
import { randomUUID } from 'node:crypto';
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import type { ApiResponseStudioParsedVariant } from '@app/backend-feature-auth-shared';
import { MongoClient } from 'mongodb';
import type { ResultAsync } from 'neverthrow';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoApiResponseStudioRepository } from './auth-mongo-api-response-studio.repository';
import { AuthMongoCollections, initializeMongoAuthPersistence } from './auth-mongo.collections';

const tenantA = '00000000-0000-4000-8000-000000000010';
const tenantB = '00000000-0000-4000-8000-000000000011';
const actorUserId = '00000000-0000-4000-8000-000000000012';
const syncedAt = new Date('2026-08-28T10:00:00.000Z');

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

async function unwrap<T, E extends { message: string }>(result: ResultAsync<T, E>): Promise<T> {
  const settled = await result;
  if (settled.isErr()) throw new Error(settled.error.message);
  return settled.value;
}

const dockerAvailable = Boolean(process.env.DOCKER_HOST || process.env.TESTCONTAINERS_HOST_OVERRIDE || process.env.CI);
const describeIfDocker = dockerAvailable ? describe : describe.skip;
if (!dockerAvailable) {
  process.stderr.write('API Response Studio Mongo component tests: skipped because Docker is not configured.\n');
}

describeIfDocker('MongoApiResponseStudioRepository on a replica set', () => {
  let container: StartedMongoDBContainer;
  let client: MongoClient;

  beforeAll(async () => {
    container = await new MongoDBContainer('mongo:7.0.26-jammy').start();
    const separator = container.getConnectionString().includes('?') ? '&' : '?';
    client = new MongoClient(`${container.getConnectionString()}${separator}directConnection=true&replicaSet=rs0`);
    await client.connect();
  });

  beforeEach(async () => {
    const database = client.db('api_response_studio_component');
    await database.dropDatabase();
    await initializeMongoAuthPersistence(database);
  });

  afterAll(async () => {
    await client.close();
    await container.stop();
  });

  const context = () => {
    const database = client.db('api_response_studio_component');
    return { database, repository: new MongoApiResponseStudioRepository(database, client) };
  };

  const createSource = (repository: MongoApiResponseStudioRepository, tenantId: string, slug: string) =>
    unwrap(
      repository.createSource({
        tenantId,
        name: slug,
        slug,
        jsonUrl: `https://example.com/${slug}.json`,
        actorUserId,
      }),
    );

  it('isolates source, response, dashboard and history queries by tenant identity', async () => {
    const { repository } = context();
    const sourceA = await createSource(repository, tenantA, 'payments-a');
    await createSource(repository, tenantB, 'payments-b');
    await unwrap(
      repository.sync({
        tenantId: tenantA,
        sourceId: sourceA.id,
        expectedRevision: sourceA.revision,
        variants: [variant('ERR-key', 'ERR')],
        actorUserId,
        syncedAt,
      }),
    );

    await expect(unwrap(repository.listSources(tenantA))).resolves.toHaveLength(1);
    await expect(unwrap(repository.listResponses(tenantB))).resolves.toEqual([]);
    await expect(unwrap(repository.dashboard(tenantB))).resolves.toMatchObject({
      totals: { sources: 1, responses: 0 },
    });
    await expect(unwrap(repository.history(tenantB))).resolves.toHaveLength(1);
  });

  it('keeps unchanged sync idempotent and soft-deletes/revives ERR and NET without losing presentation config', async () => {
    const { repository } = context();
    const source = await createSource(repository, tenantA, 'payments');
    const first = await unwrap(
      repository.sync({
        tenantId: tenantA,
        sourceId: source.id,
        expectedRevision: source.revision,
        variants: [variant('ERR-key', 'ERR'), variant('NET-key', 'NET')],
        actorUserId,
        syncedAt,
      }),
    );
    const rows = await unwrap(repository.listResponses(tenantA));
    const net = rows.find((row) => row.status === 'NET');
    if (!net) throw new Error('Expected NET row.');
    const edited = await unwrap(
      repository.updateResponse({
        tenantId: tenantA,
        id: net.id,
        expectedRevision: net.revision,
        actorUserId,
        display: 'modal',
        severity: 'warning',
        support: true,
        customDescription: 'Contact support',
        figmaOnly: true,
        comments: 'Keep this presentation',
        texts: { en: ['English'], ru: ['Русский'], zh: ['中文'] },
      }),
    );

    const second = await unwrap(
      repository.sync({
        tenantId: tenantA,
        sourceId: source.id,
        expectedRevision: first.source.revision,
        variants: [variant('ERR-key', 'ERR'), variant('NET-key', 'NET')],
        actorUserId,
        syncedAt,
      }),
    );
    expect(second.summary).toEqual({ created: 0, modified: 0, deleted: 0, unchanged: 2 });
    expect(second.source.revision).toBe(first.source.revision);
    await expect(unwrap(repository.listResponses(tenantA, { exact: 'NET-key' }))).resolves.toContainEqual(
      expect.objectContaining({ id: edited.id, revision: edited.revision, display: 'modal', texts: edited.texts }),
    );

    const deleted = await unwrap(
      repository.sync({
        tenantId: tenantA,
        sourceId: source.id,
        expectedRevision: second.source.revision,
        variants: [variant('ERR-key', 'ERR')],
        actorUserId,
        syncedAt,
      }),
    );
    expect(deleted.summary.deleted).toBe(1);
    const removed = (await unwrap(repository.listResponses(tenantA, { exact: 'NET-key', includeDeleted: true })))[0];
    expect(removed).toMatchObject({ deleted: true, changeState: 'deleted', display: 'modal', texts: edited.texts });

    const revived = await unwrap(
      repository.sync({
        tenantId: tenantA,
        sourceId: source.id,
        expectedRevision: deleted.source.revision,
        variants: [variant('ERR-key', 'ERR'), variant('NET-key', 'NET', 'fingerprint-NET-v2')],
        actorUserId,
        syncedAt,
      }),
    );
    expect(revived.summary.modified).toBe(1);
    await expect(unwrap(repository.listResponses(tenantA, { exact: 'NET-key' }))).resolves.toContainEqual(
      expect.objectContaining({
        deleted: false,
        changeState: 'new',
        display: 'modal',
        severity: 'warning',
        support: true,
        customDescription: 'Contact support',
        figmaOnly: true,
        comments: 'Keep this presentation',
        texts: edited.texts,
      }),
    );
  });

  it('uses optimistic revisions and rolls back stale atomic bulk changes with history/audit/outbox', async () => {
    const { database, repository } = context();
    const source = await createSource(repository, tenantA, 'bulk');
    const synced = await unwrap(
      repository.sync({
        tenantId: tenantA,
        sourceId: source.id,
        expectedRevision: source.revision,
        variants: [variant('first', '400'), variant('second', 'NET')],
        actorUserId,
        syncedAt,
      }),
    );
    const rows = await unwrap(repository.listResponses(tenantA));
    const beforeCounts = await Promise.all([
      database.collection(AuthMongoCollections.apiResponseHistory).countDocuments(),
      database.collection(AuthMongoCollections.auditLogs).countDocuments(),
      database.collection(AuthMongoCollections.outbox).countDocuments(),
    ]);

    const stale = await repository.bulkUpdate({
      tenantId: tenantA,
      items: [
        { id: rows[0]!.id, expectedRevision: rows[0]!.revision },
        { id: rows[1]!.id, expectedRevision: rows[1]!.revision - 1 },
      ],
      patch: { severity: 'info' },
      actorUserId,
    });
    expect(stale.isErr()).toBe(true);
    expect(stale._unsafeUnwrapErr()).toMatchObject({ code: 'revision_conflict' });
    expect((await unwrap(repository.listResponses(tenantA))).map((row) => row.severity)).toEqual(['error', 'error']);
    await expect(
      Promise.all([
        database.collection(AuthMongoCollections.apiResponseHistory).countDocuments(),
        database.collection(AuthMongoCollections.auditLogs).countDocuments(),
        database.collection(AuthMongoCollections.outbox).countDocuments(),
      ]),
    ).resolves.toEqual(beforeCounts);

    const row = rows[0]!;
    const cas = await Promise.all([
      repository.updateResponse({
        tenantId: tenantA,
        id: row.id,
        expectedRevision: row.revision,
        actorUserId,
        display: 'toast',
        severity: 'warning',
        support: false,
        customDescription: '',
        figmaOnly: false,
        comments: 'first',
        texts: { en: [], ru: [], zh: [] },
      }),
      repository.updateResponse({
        tenantId: tenantA,
        id: row.id,
        expectedRevision: row.revision,
        actorUserId,
        display: 'silent',
        severity: 'error',
        support: false,
        customDescription: '',
        figmaOnly: false,
        comments: 'second',
        texts: { en: [], ru: [], zh: [] },
      }),
    ]);
    expect(cas.filter((result) => result.isOk())).toHaveLength(1);
    expect(cas.filter((result) => result.isErr())[0]).toMatchObject({ error: { code: 'revision_conflict' } });
    expect(synced.source.revision).toBe(2);
  });

  it('rejects empty, oversized and duplicate bulk selections before mutation', async () => {
    const { database, repository } = context();
    const source = await createSource(repository, tenantA, 'bounds');
    await unwrap(
      repository.sync({
        tenantId: tenantA,
        sourceId: source.id,
        expectedRevision: source.revision,
        variants: [variant('only', 'ERR')],
        actorUserId,
        syncedAt,
      }),
    );
    const row = (await unwrap(repository.listResponses(tenantA)))[0]!;
    const counts = () =>
      Promise.all([
        database.collection(AuthMongoCollections.apiResponseHistory).countDocuments(),
        database.collection(AuthMongoCollections.auditLogs).countDocuments(),
        database.collection(AuthMongoCollections.outbox).countDocuments(),
      ]);
    const before = await counts();

    for (const items of [
      [],
      Array.from({ length: 201 }, (_, index) => ({ id: `row-${index}`, expectedRevision: 1 })),
    ]) {
      const settled = await repository.bulkUpdate({
        tenantId: tenantA,
        items,
        patch: { severity: 'info' },
        actorUserId,
      });
      expect(settled._unsafeUnwrapErr()).toMatchObject({ code: 'validation_error' });
    }
    const duplicate = await repository.bulkUpdate({
      tenantId: tenantA,
      items: [
        { id: row.id, expectedRevision: row.revision },
        { id: row.id, expectedRevision: row.revision },
      ],
      patch: { severity: 'info' },
      actorUserId,
    });
    expect(duplicate._unsafeUnwrapErr()).toMatchObject({ code: 'revision_conflict' });
    await expect(counts()).resolves.toEqual(before);
  });

  it('writes bounded redacted history, audit and outbox snapshots together', async () => {
    const { database, repository } = context();
    const source = await createSource(repository, tenantA, 'snapshots');
    await unwrap(
      repository.sync({
        tenantId: tenantA,
        sourceId: source.id,
        expectedRevision: source.revision,
        variants: [variant('snapshot', 'ERR')],
        actorUserId,
        syncedAt,
      }),
    );
    const row = (await unwrap(repository.listResponses(tenantA)))[0]!;
    await unwrap(
      repository.updateResponse({
        tenantId: tenantA,
        id: row.id,
        expectedRevision: row.revision,
        actorUserId,
        display: 'custom',
        severity: 'info',
        support: true,
        customDescription: 'A'.repeat(40_000),
        figmaOnly: false,
        comments: 'updated',
        texts: { en: ['Updated'], ru: ['Обновлено'], zh: ['已更新'] },
        metadata: { authorization: 'Bearer secret', password: 'hidden', requestId: randomUUID() },
      }),
    );

    const history = await database.collection(AuthMongoCollections.apiResponseHistory).findOne({ responseId: row.id });
    const audit = await database.collection(AuthMongoCollections.auditLogs).findOne({
      resource: 'admin.settings.api_response_studio',
      action: 'admin.api_response_studio.response.update',
    });
    const outbox = await database.collection(AuthMongoCollections.outbox).findOne({
      aggregateType: 'api-response-studio',
      eventType: 'admin.api_response_studio.response.update',
    });
    expect(history?.metadata).toMatchObject({ authorization: '[redacted]', password: '[redacted]' });
    expect(Buffer.byteLength(JSON.stringify(history?.after), 'utf8')).toBeLessThanOrEqual(32 * 1024);
    expect(audit).toMatchObject({ before: history?.before, after: history?.after });
    expect(outbox).toMatchObject({ payload: { before: history?.before, after: history?.after } });
  });
});
