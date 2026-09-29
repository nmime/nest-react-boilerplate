/* eslint-disable no-await-in-loop -- Ordered calls verify tenant filters and guard mutations on a shared fixture. */
// @requirements REQ-API-RESPONSE-STUDIO-003 REQ-API-RESPONSE-STUDIO-004
import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { ApiResponseStudioService } from './api-response-studio.service';

const actor = { tenantId: 'tenant', actorUserId: 'actor' };
const presentation = {
  display: 'toast' as const,
  severity: 'error' as const,
  support: false,
  customDescription: '',
  figmaOnly: false,
  comments: '',
  texts: { en: [], ru: [], zh: [] },
};
const forward = () => vi.fn((input: unknown) => okAsync(input));

describe('API Response Studio service boundaries', () => {
  it('preserves tenant, query and revision ownership through source and inventory operations', async () => {
    const repository = Object.fromEntries(
      [
        'dashboard',
        'listSources',
        'listResponses',
        'countResponses',
        'history',
        'createSource',
        'updateSource',
        'resetResponse',
        'dismissChanges',
      ].map((name) => [name, forward()]),
    );
    const service = new ApiResponseStudioService(repository as never, {} as never);
    await service.dashboard(actor.tenantId);
    await service.listSources(actor.tenantId);
    const query = { sourceId: 'source', search: 'query' };
    await service.listResponses(actor.tenantId, query);
    await service.countResponses(actor.tenantId, query);
    await service.history(actor.tenantId, { sourceId: 'source' });
    const create = { ...actor, name: 'Source', slug: 'source', jsonUrl: 'https://example.test/api.json' };
    await service.createSource(create);
    await service.updateSource({ ...create, id: 'source', expectedRevision: 2 });
    await service.resetResponse({ ...actor, id: 'row', expectedRevision: 2 });
    const dismiss = { ...actor, items: [{ id: 'row', expectedRevision: 2 }] };
    await service.dismissChanges(dismiss);
    expect(repository['listResponses']).toHaveBeenCalledWith(actor.tenantId, query);
    expect(repository['history']).toHaveBeenCalledWith(actor.tenantId, { sourceId: 'source' });
    expect(repository['createSource']).toHaveBeenCalledWith(create);
    expect(repository['resetResponse']).toHaveBeenCalledWith({ ...actor, id: 'row', expectedRevision: 2 });
    expect(repository['dismissChanges']).toHaveBeenCalledOnce();
    for (const items of [[], Array.from({ length: 201 }, () => ({ id: 'row', expectedRevision: 2 }))]) {
      expect((await service.dismissChanges({ ...actor, items }))._unsafeUnwrapErr().code).toBe('validation_error');
    }
    expect(repository['dismissChanges']).toHaveBeenCalledOnce();
  });

  it('normalizes enum controls, rejects duplicate/empty properties and preserves metadata', async () => {
    const repository = { updateResponse: forward() };
    const service = new ApiResponseStudioService(repository as never, {} as never);
    const input = { ...actor, id: 'row', expectedRevision: 2, presentation, metadata: { requestId: 'request' } };
    await service.updateResponse({
      ...input,
      enumChoices: [{ property: ' code ', values: [' b ', 'a', 'b', ''], enabledValues: [' b ', 'missing', 'b', 'a'] }],
    });
    expect(repository.updateResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        ...actor,
        metadata: input.metadata,
        enumChoices: [{ property: 'code', values: ['a', 'b'], enabledValues: ['a', 'b'] }],
      }),
    );
    for (const enumChoices of [
      [{ property: '', values: ['a'], enabledValues: [] }],
      [{ property: 'code', values: [''], enabledValues: [] }],
      [
        { property: 'code', values: ['a'], enabledValues: [] },
        { property: 'code', values: ['b'], enabledValues: [] },
      ],
    ]) {
      expect((await service.updateResponse({ ...input, enumChoices }))._unsafeUnwrapErr().code).toBe(
        'validation_error',
      );
    }
    expect(repository.updateResponse).toHaveBeenCalledOnce();
  });

  it('bounds bulk writes and normalizes supplied texts without replacing a partial flag-only patch', async () => {
    const repository = { bulkUpdate: forward() };
    const service = new ApiResponseStudioService(repository as never, {} as never);
    const input = { ...actor, items: [{ id: 'row', expectedRevision: 2 }] };
    await service.bulkUpdate({ ...input, patch: { support: true } });
    expect(repository.bulkUpdate).toHaveBeenLastCalledWith({ ...input, patch: { support: true } });
    await service.bulkUpdate({ ...input, patch: { texts: undefined } });
    expect(repository.bulkUpdate).toHaveBeenLastCalledWith({ ...input, patch: presentation });
    await service.bulkUpdate({
      ...input,
      patch: { ...presentation, texts: { en: [' trimmed '], ru: [], zh: [] }, comments: ' comment ', support: true },
    });
    expect(repository.bulkUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({
          texts: { en: ['trimmed'], ru: [], zh: [] },
          comments: 'comment',
          support: true,
        }),
      }),
    );
    expect(
      (
        await service.bulkUpdate({
          ...input,
          patch: { ...presentation, texts: { en: ['{name}'], ru: ['{other}'], zh: [] } },
        })
      )._unsafeUnwrapErr().code,
    ).toBe('validation_error');
    for (const items of [[], Array.from({ length: 201 }, () => ({ id: 'row', expectedRevision: 2 }))]) {
      expect((await service.bulkUpdate({ ...input, items, patch: {} }))._unsafeUnwrapErr().code).toBe(
        'validation_error',
      );
    }
    expect(repository.bulkUpdate).toHaveBeenCalledTimes(3);
  });

  it('refuses missing sources, excessive saved rows, reference fan-out and unknown retrieval failures before writes', async () => {
    const repository = {
      findSource: vi.fn().mockReturnValue(okAsync(null)),
      listResponses: vi.fn().mockReturnValue(okAsync([])),
      sync: forward(),
    };
    const fetcher = { fetchJson: vi.fn(), fetchJsonReference: vi.fn() };
    const service = new ApiResponseStudioService(repository as never, fetcher as never);
    const input = { ...actor, sourceId: 'source', expectedRevision: 2 };
    expect((await service.sync(input))._unsafeUnwrapErr().message).toContain('not found');
    repository.findSource.mockReturnValue(okAsync({ jsonUrl: 'https://example.test/api.json' }));
    repository.listResponses.mockReturnValue(okAsync(Array.from({ length: 500 }, () => ({}))));
    expect((await service.sync(input))._unsafeUnwrapErr().message).toContain('10000-row');
    expect(fetcher.fetchJson).not.toHaveBeenCalled();
    repository.listResponses.mockReturnValue(okAsync([]));
    fetcher.fetchJson.mockResolvedValue({
      openapi: '3.1.0',
      components: Object.fromEntries(
        Array.from({ length: 33 }, (_, index) => [
          `Schema${index}`,
          { $ref: `https://example.test/${index}.json#/Schema` },
        ]),
      ),
    });
    expect((await service.sync(input))._unsafeUnwrapErr().message).toContain('32-document');
    fetcher.fetchJson.mockRejectedValue(null);
    expect((await service.sync(input))._unsafeUnwrapErr()).toMatchObject({
      code: 'validation_error',
      message: 'API Response Studio request is invalid.',
    });
    expect(repository.sync).not.toHaveBeenCalled();
  });

  it('refuses repository failures and oversized export inventories rather than returning partial data', async () => {
    const repository = {
      listResponses: vi.fn().mockReturnValue(errAsync({ code: 'repository_error', message: 'unavailable' })),
    };
    const service = new ApiResponseStudioService(repository as never, {} as never);
    expect((await service.export(actor.tenantId))._unsafeUnwrapErr().message).toBe('unavailable');
    repository.listResponses.mockReturnValue(okAsync(Array.from({ length: 500 }, () => ({}))));
    expect((await service.export(actor.tenantId))._unsafeUnwrapErr().message).toContain('10000-row');
    expect(repository.listResponses).toHaveBeenCalledTimes(21);
  });
});
