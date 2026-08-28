// @requirements REQ-API-RESPONSE-STUDIO-003
// @requirements REQ-API-RESPONSE-STUDIO-004
import type { Db } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { AuthMongoCollectionDefinitions, AuthMongoCollections } from '../auth-mongo.collections';
import { Migration20260812120000AddAuthUserAccountRecovery } from './Migration20260812120000AddAuthUserAccountRecovery';
import { Migration20260828110000CreateApiResponseStudio } from './Migration20260828110000CreateApiResponseStudio';
import { authMongoMigrations } from './index';

const definition = (name: string) => {
  const value = AuthMongoCollectionDefinitions.find((item) => item.name === name);
  if (!value) {throw new Error(`Missing collection definition ${name}.`);}
  return value;
};

const createExistingDatabase = () => {
  const command = vi.fn<(argument: Record<string, unknown>) => Promise<{ ok: number }>>(() =>
    Promise.resolve({ ok: 1 }),
  );
  const updateMany = vi.fn(() => Promise.resolve({ acknowledged: true }));
  const stub = {
    createIndexes: () => Promise.resolve([]),
    updateOne: () => Promise.resolve({ acknowledged: true }),
    updateMany,
    findOne: () => Promise.resolve({ _id: 'id' }),
    findOneAndUpdate: () => Promise.resolve({ _id: 'id' }),
    deleteMany: () => Promise.resolve({ deletedCount: 0 }),
    find: (filter: { key?: { $in?: string[] } }) => ({
      toArray: () => Promise.resolve((filter.key?.$in ?? []).map((key) => ({ _id: key, key }))),
    }),
  };
  const database = {
    createCollection: () => Promise.reject(Object.assign(new Error('exists'), { code: 48 })),
    command,
    collection: () => stub,
  } as unknown as Db;
  return { command, database, updateMany };
};

describe('API Response Studio MongoDB migration', () => {
  it('declares strict tenant-scoped validators and indexes for sources, responses and history', () => {
    const sources = definition(AuthMongoCollections.apiResponseSources);
    const responses = definition(AuthMongoCollections.apiResponseRows);
    const history = definition(AuthMongoCollections.apiResponseHistory);

    expect(sources.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'uq__api_response_studio_sources__tenant_slug', unique: true }),
        expect.objectContaining({ name: 'ix__api_response_studio_sources__tenant_enabled' }),
      ]),
    );
    expect(responses.indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'uq__api_response_studio_responses__tenant_source_key', unique: true }),
        expect.objectContaining({ name: 'ix__api_response_studio_responses__tenant_source_path' }),
        expect.objectContaining({ name: 'ix__api_response_studio_responses__tenant_change' }),
        expect.objectContaining({ name: 'ix__api_response_studio_responses__tenant_deleted' }),
      ]),
    );
    expect(history.indexes).toHaveLength(3);

    const responseSchema = responses.validator['$jsonSchema'] as {
      required: string[];
      properties: Record<string, { enum?: string[]; bsonType?: string | string[] }>;
    };
    expect(responseSchema.required).toEqual(
      expect.arrayContaining(['tenantId', 'stableKey', 'deleted', 'display', 'texts', 'revision']),
    );
    expect(responseSchema.properties['method']?.enum).toContain('TRACE');
    expect(responseSchema.properties['display']?.enum).toEqual(['toast', 'modal', 'custom', 'silent']);
    expect(responseSchema.properties['severity']?.enum).toEqual(['error', 'warning', 'info', 'success']);
  });

  it('reconciles existing validators through collMod and preserves existing legacy presentation fields', async () => {
    const { command, database, updateMany } = createExistingDatabase();

    await Migration20260828110000CreateApiResponseStudio.up(database);

    const modified = command.mock.calls.map(([argument]) => argument['collMod']);
    expect(modified).toEqual(
      expect.arrayContaining([
        AuthMongoCollections.apiResponseSources,
        AuthMongoCollections.apiResponseRows,
        AuthMongoCollections.apiResponseHistory,
        AuthMongoCollections.presentations,
      ]),
    );
    expect(updateMany).toHaveBeenCalledTimes(1);
    const [filter, pipeline] = updateMany.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Array<Record<string, unknown>>,
    ];
    expect(filter).toEqual({});
    expect(pipeline).toEqual([
      {
        $set: {
          messageZh: { $ifNull: ['$messageZh', ''] },
          textsEn: { $ifNull: ['$textsEn', { $cond: [{ $eq: ['$messageEn', ''] }, [], ['$messageEn']] }] },
          textsRu: { $ifNull: ['$textsRu', { $cond: [{ $eq: ['$messageRu', ''] }, [], ['$messageRu']] }] },
          textsZh: { $ifNull: ['$textsZh', []] },
          support: { $ifNull: ['$support', false] },
          customDescription: { $ifNull: ['$customDescription', ''] },
          figmaOnly: { $ifNull: ['$figmaOnly', false] },
        },
      },
    ]);
  });

  it('is monotonic and last in the ordered migration catalog', () => {
    expect(Migration20260828110000CreateApiResponseStudio.id).toBe('20260828110000_create_api_response_studio');
    expect(
      Migration20260828110000CreateApiResponseStudio.id > Migration20260812120000AddAuthUserAccountRecovery.id,
    ).toBe(true);
    expect(authMongoMigrations.at(-1)).toBe(Migration20260828110000CreateApiResponseStudio);
  });
});
