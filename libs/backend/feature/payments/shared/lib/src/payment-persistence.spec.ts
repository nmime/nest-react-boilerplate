// @requirements REQ-PAYMENTS-SCAFFOLD-001
import { describe, expect, it } from 'vitest';
import { PaymentsPersistence } from './payment-persistence';
import type { CreatePaymentsDto, PaymentsDto } from './payment.types';

/**
 * In-memory implementation that proves the port's shape: every axis repository (U3 Postgres, U4
 * MongoDB) implements this exact contract, and feature code compiles against nothing else.
 */
class InMemoryPaymentsPersistence extends PaymentsPersistence {
  private readonly stored = new Map<string, PaymentsDto>();

  override async listPayments(): Promise<PaymentsDto[]> {
    return [...this.stored.values()];
  }

  override async createPayment(input: CreatePaymentsDto): Promise<PaymentsDto> {
    const dto: PaymentsDto = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: input.name,
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    this.stored.set(dto.id, dto);
    return dto;
  }

  override async findPayment(id: string): Promise<PaymentsDto | null> {
    return this.stored.get(id) ?? null;
  }
}

describe('PaymentsPersistence port', () => {
  it('is an abstract token that axes bind implementations to', () => {
    const persistence: PaymentsPersistence = new InMemoryPaymentsPersistence();

    expect(persistence).toBeInstanceOf(PaymentsPersistence);
  });

  it('round-trips a payment through list and find', async () => {
    const persistence = new InMemoryPaymentsPersistence();
    const created = await persistence.createPayment({ name: 'Example' });

    await expect(persistence.listPayments()).resolves.toEqual([created]);
    await expect(persistence.findPayment(created.id)).resolves.toEqual(created);
    await expect(persistence.findPayment('missing')).resolves.toBeNull();
  });
});
