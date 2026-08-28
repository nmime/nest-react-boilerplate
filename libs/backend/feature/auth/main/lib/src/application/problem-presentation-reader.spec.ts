// @requirements REQ-AUTH-ACCESS-001 REQ-API-RESPONSE-STUDIO-001
import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { ProblemPresentationRecord } from '@app/backend-feature-auth-shared';
import { InMemoryProblemPresentationReader, PostgresProblemPresentationReader } from './problem-presentation-reader';

const emptyStudio = { listResponses: vi.fn(() => okAsync([])) };

describe('problem presentation readers', () => {
  it('uses generated defaults when persistence is in-memory', async () => {
    await expect(new InMemoryProblemPresentationReader().list()).resolves.toEqual([]);
  });

  it('maps tenant-scoped legacy and Studio overrides into the public runtime shape', async () => {
    const entity = {
      id: 'presentation-id',
      tenantId: '00000000-0000-4000-8000-000000000001',
      ruleId: 'user-app-api:PATCH:/profile:409:resource-conflict',
      display: 'silent',
      messageEn: 'Conflict',
      messageRu: 'Конфликт',
      severity: 'info',
      revision: 2,
      updatedByUserId: '00000000-0000-4000-8000-000000000002',
      createdAt: new Date('2026-07-19T11:00:00.000Z'),
      updatedAt: new Date('2026-07-19T12:00:00.000Z'),
      comment: '',
      messageZh: '',
      textsEn: ['Conflict'],
      textsRu: ['Конфликт'],
      textsZh: [],
      support: false,
      customDescription: '',
      figmaOnly: false,
    } satisfies ProblemPresentationRecord;
    const studioRow = {
      stableKey: 'GET:/widgets:500:server-error',
      display: 'modal',
      severity: 'error',
      texts: { en: ['Try again'], ru: ['Повторите'], zh: ['重试'] },
      customDescription: 'Contact support',
      figmaOnly: false,
      support: true,
      revision: 4,
      updatedAt: new Date('2026-07-19T13:00:00.000Z'),
      updatedByUserId: entity.updatedByUserId,
    };
    const repository = { list: vi.fn(() => okAsync([entity])) };
    const studio = { listResponses: vi.fn(() => okAsync([studioRow])) };
    const reader = new PostgresProblemPresentationReader(repository as never, studio as never);

    await expect(reader.list(entity.tenantId)).resolves.toEqual([
      expect.objectContaining({
        display: 'modal',
        messageEn: 'Try again',
        messageRu: 'Повторите',
        messageZh: '重试',
        ruleId: studioRow.stableKey,
        support: true,
        texts: studioRow.texts,
      }),
      expect.objectContaining({
        display: 'silent',
        messageEn: 'Conflict',
        messageRu: 'Конфликт',
        revision: 2,
        ruleId: entity.ruleId,
        severity: 'info',
        updatedAt: '2026-07-19T12:00:00.000Z',
      }),
    ]);
    expect(repository.list).toHaveBeenCalledWith(entity.tenantId);
    expect(studio.listResponses).toHaveBeenCalledWith(entity.tenantId, {
      includeDeleted: false,
      limit: 500,
      offset: 0,
    });
  });

  it('fails closed when persisted presentation configuration is unavailable', async () => {
    const cause = { code: 'repository_error', message: 'database unavailable' };
    const repository = { list: vi.fn(() => errAsync(cause)) };
    const reader = new PostgresProblemPresentationReader(repository as never, emptyStudio as never);

    await expect(reader.list('tenant-1')).rejects.toMatchObject({
      message: 'Problem presentation configuration is unavailable.',
      cause,
    });
  });

  it('fails closed when Studio presentation configuration is unavailable', async () => {
    const cause = { code: 'repository_error', message: 'database unavailable' };
    const repository = { list: vi.fn(() => okAsync([])) };
    const studio = { listResponses: vi.fn(() => errAsync(cause)) };
    const reader = new PostgresProblemPresentationReader(repository as never, studio as never);

    await expect(reader.list('tenant-1')).rejects.toMatchObject({
      message: 'API Response Studio configuration is unavailable.',
      cause,
    });
  });
});
