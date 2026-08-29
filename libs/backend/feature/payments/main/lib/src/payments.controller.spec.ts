// @requirements REQ-PAYMENT-ORDER-003 REQ-PAYMENT-WEBHOOK-001
import { describe, expect, it } from 'vitest';
import type { PaymentsDto } from '@app/backend-feature-payments-shared';
import { PaymentsController } from './payments.controller';

const dto: PaymentsDto = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  name: 'Example',
  createdAt: '2024-01-01T00:00:00.000Z',
};

function controllerWith(service: unknown): PaymentsController {
  return new PaymentsController(service as never);
}

describe('PaymentsController', () => {
  it('wraps the listed payments in an ok envelope', async () => {
    const controller = controllerWith({ list: async () => [dto], create: async () => dto });
    await expect(controller.list()).resolves.toEqual({ data: [dto] });
  });

  it('wraps the created payments in an ok envelope', async () => {
    const controller = controllerWith({ list: async () => [dto], create: async () => dto });
    await expect(controller.create({ name: 'Example' })).resolves.toEqual({ data: dto });
  });
});
