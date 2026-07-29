import { errAsync, okAsync } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import type { ProblemPresentationRecord } from '@app/backend-feature-auth-shared';
import { InMemoryProblemPresentationReader, PostgresProblemPresentationReader } from './problem-presentation-reader';

describe('problem presentation readers', () => {
  it('uses generated defaults when persistence is in-memory', async () => {
    await expect(new InMemoryProblemPresentationReader().list()).resolves.toEqual([]);
  });

  it('maps tenant-scoped Postgres overrides into the public runtime shape', async () => {
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
    } satisfies ProblemPresentationRecord;
    const repository = { list: vi.fn(() => okAsync([entity])) };
    const reader = new PostgresProblemPresentationReader(repository as never);

    await expect(reader.list(entity.tenantId)).resolves.toEqual([
      {
        display: 'silent',
        messageEn: 'Conflict',
        messageRu: 'Конфликт',
        revision: 2,
        ruleId: 'user-app-api:PATCH:/profile:409:resource-conflict',
        severity: 'info',
        updatedAt: '2026-07-19T12:00:00.000Z',
      },
    ]);
    expect(repository.list).toHaveBeenCalledWith(entity.tenantId);
  });

  it('fails closed when persisted presentation configuration is unavailable', async () => {
    const cause = { code: 'repository_error', message: 'database unavailable' };
    const repository = { list: vi.fn(() => errAsync(cause)) };
    const reader = new PostgresProblemPresentationReader(repository as never);

    await expect(reader.list('tenant-1')).rejects.toMatchObject({
      message: 'Problem presentation configuration is unavailable.',
      cause,
    });
  });
});
