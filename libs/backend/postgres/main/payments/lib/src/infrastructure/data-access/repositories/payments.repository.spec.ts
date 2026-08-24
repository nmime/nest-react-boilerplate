// @requirements REQ-PAYMENT-ORDER-003 REQ-PAYMENT-PROVIDER-001
import { describe, expect, it } from 'vitest';
import { PaymentsEntity } from '../entities';
import { PaymentsPostgresPersistence } from './payments.repository';

function persistenceWith(entityManager: unknown): PaymentsPostgresPersistence {
  return new PaymentsPostgresPersistence(entityManager as never);
}

describe('PaymentsPostgresPersistence', () => {
  it('lists newest first and maps rows to the port DTO', async () => {
    const entity = new PaymentsEntity({ name: 'Example' });
    const entityManager = {
      find: async (_entity: unknown, _where: unknown, options: { orderBy: { createdAt: 'ASC' | 'DESC' } }) => {
        expect(options.orderBy).toEqual({ createdAt: 'DESC' });
        return [entity];
      },
    };

    await expect(persistenceWith(entityManager).listPayments()).resolves.toEqual([
      { id: entity.id, name: 'Example', createdAt: entity.createdAt.toISOString() },
    ]);
  });

  it('persists and flushes a new payment and returns the port DTO', async () => {
    const persisted: unknown[] = [];
    const entityManager = {
      persist: (entity: unknown) => persisted.push(entity),
      flush: async () => undefined,
    };

    const created = await persistenceWith(entityManager).createPayment({ name: 'Example' });

    expect(persisted).toHaveLength(1);
    expect(created).toMatchObject({ name: 'Example' });
    expect(created.id).toBe((persisted[0] as PaymentsEntity).id);
  });

  it('finds a stored payment by id', async () => {
    const entity = new PaymentsEntity({ name: 'Example' });
    const entityManager = {
      findOne: async (_entity: unknown, where: { id: string }) => {
        expect(where).toEqual({ id: entity.id });
        return entity;
      },
    };

    await expect(persistenceWith(entityManager).findPayment(entity.id)).resolves.toEqual({
      id: entity.id,
      name: 'Example',
      createdAt: entity.createdAt.toISOString(),
    });
  });

  it('returns null when no payment matches the id', async () => {
    const entityManager = { findOne: async () => null };

    await expect(persistenceWith(entityManager).findPayment('missing')).resolves.toBeNull();
  });
});
