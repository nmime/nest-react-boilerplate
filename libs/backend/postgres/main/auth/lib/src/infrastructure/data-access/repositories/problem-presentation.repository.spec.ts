import type { EntityManager } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { AdminAuditLogEntity, DefaultAuthTenantId, ProblemPresentationEntity } from '../entities';
import { ProblemPresentationRepository } from './problem-presentation.repository';

const actorUserId = '00000000-0000-4000-8000-000000000002';
const ruleId = 'user-app-api:PATCH:/profile:409:resource-conflict';

const createEntityManager = (existing: ProblemPresentationEntity | null = null) => {
  const execute = vi.fn(() => Promise.resolve([]));
  const findOne = vi.fn(() => Promise.resolve(existing));
  const persist = vi.fn((_value: unknown) => undefined);
  const remove = vi.fn((_value: unknown) => undefined);
  const flush = vi.fn(() => Promise.resolve());
  const transaction = {
    findOne,
    persist,
    remove,
    flush,
    getConnection: vi.fn(() => ({ execute })),
  };
  const transactional = vi.fn((callback: (em: typeof transaction) => Promise<unknown>) => callback(transaction));
  const find = vi.fn(() => Promise.resolve(existing ? [existing] : []));
  const entityManager = { find, transactional } as unknown as EntityManager;

  return { entityManager, execute, find, findOne, flush, persist, remove, transactional };
};

describe('ProblemPresentationRepository', () => {
  it('lists overrides within a tenant using deterministic rule ordering', async () => {
    const fixture = new ProblemPresentationEntity({
      ruleId,
      display: 'toast',
      severity: 'warning',
      updatedByUserId: actorUserId,
    });
    const { entityManager, find } = createEntityManager(fixture);
    const repository = new ProblemPresentationRepository(entityManager);

    await expect(repository.list().then((result) => result._unsafeUnwrap())).resolves.toEqual([fixture]);
    expect(find).toHaveBeenCalledWith(
      ProblemPresentationEntity,
      { tenantId: DefaultAuthTenantId },
      { orderBy: { ruleId: 'ASC' } },
    );
  });

  it('creates an override and an audit entry under an advisory transaction lock', async () => {
    const { entityManager, execute, persist, flush } = createEntityManager();
    const repository = new ProblemPresentationRepository(entityManager);

    const result = await repository
      .save({
        actorUserId,
        ruleId,
        comment: '  Handled inline  ',
        display: 'silent',
        expectedRevision: 0,
        metadata: { requestId: 'request-1' },
        messageEn: '  Conflict  ',
        messageRu: '  Конфликт  ',
        severity: 'info',
      })
      .then((value) => value._unsafeUnwrap());

    expect(execute).toHaveBeenCalledWith('select pg_advisory_xact_lock(hashtext(?))', [
      `problem-presentation:${DefaultAuthTenantId}:${ruleId}`,
    ]);
    expect(result).toMatchObject({
      ruleId,
      comment: 'Handled inline',
      messageEn: 'Conflict',
      messageRu: 'Конфликт',
      display: 'silent',
      revision: 1,
      severity: 'info',
      updatedByUserId: actorUserId,
    });
    const persisted = persist.mock.calls[0]?.[0] as [ProblemPresentationEntity, AdminAuditLogEntity];
    expect(persisted[0]).toBe(result);
    expect(persisted[1]).toMatchObject({
      action: 'admin.problem_presentation.update',
      after: {
        comment: 'Handled inline',
        display: 'silent',
        messageEn: 'Conflict',
        messageRu: 'Конфликт',
        revision: 1,
        ruleId,
        severity: 'info',
      },
      before: {},
      metadata: { ruleId, requestId: 'request-1' },
      resource: 'admin.settings',
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('updates an existing override and increments its revision', async () => {
    const existing = new ProblemPresentationEntity({
      ruleId,
      comment: 'Old',
      display: 'toast',
      revision: 2,
      severity: 'warning',
      updatedByUserId: actorUserId,
    });
    const { entityManager, persist } = createEntityManager(existing);
    const repository = new ProblemPresentationRepository(entityManager);

    const updated = await repository
      .save({
        actorUserId,
        ruleId,
        display: 'silent',
        expectedRevision: 2,
        severity: 'info',
      })
      .then((result) => result._unsafeUnwrap());

    expect(updated).toMatchObject({ comment: '', display: 'silent', revision: 3, severity: 'info' });
    const audit = (persist.mock.calls[0]?.[0] as [ProblemPresentationEntity, AdminAuditLogEntity])[1];
    expect(audit.before).toMatchObject({ comment: 'Old', display: 'toast', revision: 2 });
    expect(audit.after).toMatchObject({ comment: '', display: 'silent', revision: 3 });
  });

  it('rejects stale updates without persisting', async () => {
    const existing = new ProblemPresentationEntity({
      ruleId,
      display: 'toast',
      revision: 2,
      severity: 'warning',
      updatedByUserId: actorUserId,
    });
    const { entityManager, persist } = createEntityManager(existing);
    const repository = new ProblemPresentationRepository(entityManager);

    const error = await repository
      .save({
        actorUserId,
        ruleId,
        display: 'silent',
        expectedRevision: 1,
        severity: 'info',
      })
      .then((result) => result._unsafeUnwrapErr());

    expect(error).toMatchObject({ code: 'revision_conflict' });
    expect(persist).not.toHaveBeenCalled();
  });

  it('resets an existing override with an audit record', async () => {
    const existing = new ProblemPresentationEntity({
      ruleId,
      display: 'silent',
      revision: 3,
      severity: 'info',
      updatedByUserId: actorUserId,
    });
    const { entityManager, persist, remove } = createEntityManager(existing);
    const repository = new ProblemPresentationRepository(entityManager);

    await expect(
      repository.reset({ actorUserId, ruleId, expectedRevision: 3 }).then((result) => result._unsafeUnwrap()),
    ).resolves.toBe(true);
    const persisted = persist.mock.calls[0]?.[0] as [AdminAuditLogEntity];
    expect(persisted[0]).toMatchObject({
      action: 'admin.problem_presentation.reset',
      after: {},
      resource: 'admin.settings',
    });
    expect(remove).toHaveBeenCalledWith(existing);
  });

  it('keeps an already-default reset idempotent and rejects stale resets', async () => {
    const absent = createEntityManager();
    const repository = new ProblemPresentationRepository(absent.entityManager);
    await expect(
      repository.reset({ actorUserId, ruleId, expectedRevision: 0 }).then((result) => result._unsafeUnwrap()),
    ).resolves.toBe(false);
    expect(absent.persist).not.toHaveBeenCalled();

    const existing = new ProblemPresentationEntity({
      ruleId,
      display: 'toast',
      revision: 2,
      severity: 'warning',
      updatedByUserId: actorUserId,
    });
    const stale = createEntityManager(existing);
    const staleRepository = new ProblemPresentationRepository(stale.entityManager);
    await expect(
      staleRepository.reset({ actorUserId, ruleId, expectedRevision: 1 }).then((result) => result._unsafeUnwrapErr()),
    ).resolves.toMatchObject({ code: 'revision_conflict' });
  });

  it('maps infrastructure failures without leaking non-error values', async () => {
    const errorManager = createEntityManager();
    errorManager.find.mockRejectedValue(new Error('database unavailable'));
    await expect(
      new ProblemPresentationRepository(errorManager.entityManager).list().then((result) => result._unsafeUnwrapErr()),
    ).resolves.toEqual({ code: 'repository_error', message: 'database unavailable' });

    const nonErrorManager = createEntityManager();
    nonErrorManager.find.mockRejectedValue('connection reset');
    await expect(
      new ProblemPresentationRepository(nonErrorManager.entityManager)
        .list()
        .then((result) => result._unsafeUnwrapErr()),
    ).resolves.toEqual({ code: 'repository_error', message: 'Problem presentation repository failed.' });
  });
});
