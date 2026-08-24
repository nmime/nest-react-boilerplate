// @requirements REQ-PAYMENT-ORDER-003 REQ-PAYMENT-PROVIDER-005
import { describe, expect, it, vi } from 'vitest';
import { PaymentsRepository } from './payments-mongo.repository';

const now = new Date('2026-08-23T00:00:00.000Z');
const document = { _id: '123e4567-e89b-12d3-a456-426614174000', name: 'Example', createdAt: now };

function sessionWith(overrides: Record<string, unknown> = {}) {
  return {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    inTransaction: vi.fn(() => true),
    ...overrides,
  };
}

function repositoryWith(database: unknown, client: unknown) {
  return new PaymentsRepository(database as never, client as never);
}

describe('PaymentsRepository', () => {
  it('lists documents newest first and maps them to entities', async () => {
    const database = {
      collection: vi.fn(() => ({
        find: vi.fn(() => ({
          sort: vi.fn(() => ({
            toArray: vi.fn().mockResolvedValue([document]),
          })),
        })),
      })),
    };
    const repository = repositoryWith(database, {});

    const result = await repository.list();

    expect(result._unsafeUnwrap()).toEqual([{ id: document._id, name: document.name, createdAt: now }]);
  });

  it('reports a repository error when the read fails', async () => {
    const database = {
      collection: vi.fn(() => ({
        find: vi.fn(() => ({
          sort: vi.fn(() => ({
            toArray: vi.fn().mockRejectedValue(new Error('unavailable')),
          })),
        })),
      })),
    };
    const repository = repositoryWith(database, {});

    expect((await repository.list())._unsafeUnwrapErr()).toEqual({ code: 'repository_error' });
  });

  it('persists a single document inside one transaction session', async () => {
    const session = sessionWith();
    const insertMany = vi.fn().mockResolvedValue({ acknowledged: true });
    const repository = repositoryWith(
      { collection: vi.fn(() => ({ insertMany })) },
      { startSession: vi.fn(() => session) },
    );

    const result = await repository.create('Example');

    expect(result.isOk()).toBe(true);
    expect(insertMany).toHaveBeenCalledWith(
      [expect.objectContaining({ name: 'Example' })],
      expect.objectContaining({ session }),
    );
    expect(session.commitTransaction).toHaveBeenCalledOnce();
  });

  it('uses one transaction session for a multi-document create', async () => {
    const session = sessionWith();
    const insertMany = vi.fn().mockResolvedValue({ acknowledged: true });
    const repository = repositoryWith(
      { collection: vi.fn(() => ({ insertMany })) },
      { startSession: vi.fn(() => session) },
    );

    const result = await repository.createMany(['First', 'Second']);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toHaveLength(2);
    expect(insertMany).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'First' }), expect.objectContaining({ name: 'Second' })]),
      { session },
    );
    expect(session.commitTransaction).toHaveBeenCalledOnce();
  });

  it('returns an empty list for an empty batch without opening a session', async () => {
    const startSession = vi.fn();
    const repository = repositoryWith({ collection: vi.fn() }, { startSession });

    const result = await repository.createMany([]);

    expect(result._unsafeUnwrap()).toEqual([]);
    expect(startSession).not.toHaveBeenCalled();
  });

  it('reports a repository error and aborts the session when the write fails', async () => {
    const session = sessionWith();
    const insertMany = vi.fn().mockRejectedValue(new Error('unavailable'));
    const repository = repositoryWith(
      { collection: vi.fn(() => ({ insertMany })) },
      { startSession: vi.fn(() => session) },
    );

    const result = await repository.createMany(['First']);

    expect(result._unsafeUnwrapErr()).toEqual({ code: 'repository_error' });
    expect(session.abortTransaction).toHaveBeenCalledOnce();
  });
});
