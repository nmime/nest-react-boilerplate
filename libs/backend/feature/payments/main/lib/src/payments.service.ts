import { Injectable } from '@nestjs/common';
import { InternalException } from '@app/backend-common-exception';
import { PaymentsPersistence, type CreatePaymentsDto, type PaymentsDto } from '@app/backend-feature-payments-shared';

/**
 * Scaffold service for the payments feature.
 *
 * Depends only on the `PaymentsPersistence` port, so the module never names a storage axis — the
 * same service runs on the Postgres and MongoDB axes. U9 replaces the scaffold surface with the
 * real customer orchestration (create with FX snapshot + orderRef idempotency, query, cancel,
 * refund, manual-status).
 */
@Injectable()
export class PaymentsService {
  constructor(private readonly persistence: PaymentsPersistence) {}

  async list(): Promise<PaymentsDto[]> {
    try {
      return await this.persistence.listPayments();
    } catch (cause) {
      throw new InternalException({ feature: 'payments', operation: 'list' }, cause as Error);
    }
  }

  async create(input: CreatePaymentsDto): Promise<PaymentsDto> {
    try {
      return await this.persistence.createPayment(input);
    } catch (cause) {
      throw new InternalException({ feature: 'payments', operation: 'create' }, cause as Error);
    }
  }
}
