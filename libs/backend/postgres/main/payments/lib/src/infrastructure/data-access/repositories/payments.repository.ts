import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { PaymentsPersistence, type CreatePaymentsDto, type PaymentsDto } from '@app/backend-feature-payments-shared';
import { PaymentsEntity } from '../entities';

function toPaymentsDto(entity: PaymentsEntity): PaymentsDto {
  return { id: entity.id, name: entity.name, createdAt: entity.createdAt.toISOString() };
}

/**
 * The Postgres side of {@link PaymentsPersistence} (scaffold shape).
 *
 * U3 grows the contract with the real domain — provider registry, events/outbox, webhook
 * receipts, refunds, and provider health — and rebinds this class under the same port.
 */
@Injectable()
export class PaymentsPostgresPersistence extends PaymentsPersistence {
  constructor(
    @Inject(EntityManager)
    private readonly entityManager: EntityManager,
  ) {
    super();
  }

  async listPayments(): Promise<PaymentsDto[]> {
    const rows = await this.entityManager.find(PaymentsEntity, {}, { orderBy: { createdAt: 'DESC' } });

    return rows.map(toPaymentsDto);
  }

  async createPayment(input: CreatePaymentsDto): Promise<PaymentsDto> {
    const entity = new PaymentsEntity({ name: input.name });
    this.entityManager.persist(entity);
    await this.entityManager.flush();

    return toPaymentsDto(entity);
  }

  async findPayment(id: string): Promise<PaymentsDto | null> {
    const row = await this.entityManager.findOne(PaymentsEntity, { id });

    return row ? toPaymentsDto(row) : null;
  }
}
