// @requirements REQ-PAYMENTS-SCAFFOLD-001
import { describe, expect, it } from 'vitest';
import type { PaymentsDto } from '@app/backend-feature-payments-shared';
import { PaymentsService } from './payments.service';

const dto: PaymentsDto = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Example',
  createdAt: '2024-01-01T00:00:00.000Z',
};

function serviceWith(persistence: unknown): PaymentsService {
  return new PaymentsService(persistence as never);
}

describe('PaymentsService', () => {
  it('creates a payment through the persistence port', async () => {
    const service = serviceWith({ createPayment: () => Promise.resolve(dto) });

    await expect(service.create({ name: 'Example' })).resolves.toMatchObject({ name: 'Example' });
  });

  it('lists every stored payment through the persistence port', async () => {
    const service = serviceWith({ listPayments: () => Promise.resolve([dto]) });

    await expect(service.list()).resolves.toMatchObject([{ name: 'Example' }]);
  });

  it('raises an internal exception when the persistence read fails', async () => {
    const service = serviceWith({ listPayments: () => Promise.reject(new Error('unavailable')) });

    await expect(service.list()).rejects.toThrow();
  });

  it('raises an internal exception when the persistence write fails', async () => {
    const service = serviceWith({ createPayment: () => Promise.reject(new Error('unavailable')) });

    await expect(service.create({ name: 'Example' })).rejects.toThrow();
  });
});
