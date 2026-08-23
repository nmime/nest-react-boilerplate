import type { CreatePaymentsDto, PaymentsDto } from './payment.types';

/**
 * Persistence boundary for payments.
 *
 * Implementations own transactions, entity mapping, and the receipt-first-then-transition write
 * order, so the same service runs on the Postgres and MongoDB axes without a branch. Feature code
 * must never depend on database entities directly — that is what lets the setup tool swap the axis
 * without touching feature code.
 *
 * Scaffold contract (U1): the shape the generated scaffold service uses. U3 binds
 * `PaymentsPostgresPersistence` to this token and grows the contract with the real domain —
 * provider registry, events/outbox, webhook receipts, refunds, and provider health.
 */
export abstract class PaymentsPersistence {
  abstract listPayments(): Promise<PaymentsDto[]>;

  abstract createPayment(input: CreatePaymentsDto): Promise<PaymentsDto>;

  abstract findPayment(id: string): Promise<PaymentsDto | null>;
}
