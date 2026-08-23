// @requirements REQ-PAYMENTS-SCAFFOLD-001
import { describe, expect, it } from 'vitest';
import { PaymentsEntity } from '../entities';
import { PaymentsRepository } from './payments.repository';

function repositoryWith(entityManager: unknown): PaymentsRepository {
  return new PaymentsRepository(entityManager as never);
}

describe('PaymentsRepository', () => {
  it('lists newest first', async () => {
    const entity = new PaymentsEntity({ name: 'Example' });
    const repository = repositoryWith({ find: async () => [entity] });

    const result = await repository.list();

    expect(result._unsafeUnwrap()).toEqual([entity]);
  });

  it('reports a repository error when the read fails', async () => {
    const repository = repositoryWith({
      find: async () => {
        throw new Error('unavailable');
      },
    });

    expect((await repository.list())._unsafeUnwrapErr()).toEqual({ code: 'repository_error' });
  });

  it('persists and flushes a new payments', async () => {
    const persisted: unknown[] = [];
    const repository = repositoryWith({
      persist: (entity: unknown) => persisted.push(entity),
      flush: async () => undefined,
    });

    const result = await repository.create('Example');

    expect(result._unsafeUnwrap().name).toBe('Example');
    expect(persisted).toHaveLength(1);
  });

  it('reports a repository error when the flush fails', async () => {
    const repository = repositoryWith({
      persist: () => undefined,
      flush: async () => {
        throw new Error('unavailable');
      },
    });

    expect((await repository.create('Example'))._unsafeUnwrapErr()).toEqual({ code: 'repository_error' });
  });
});
