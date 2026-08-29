import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { PaymentsPersistence } from '@app/backend-feature-payments-shared';
import {
  PaymentEntitySchema,
  PaymentEventEntitySchema,
  PaymentProviderEntitySchema,
  PaymentProviderHealthEntitySchema,
  PaymentRefundEntitySchema,
  PaymentWebhookReceiptEntitySchema,
} from './infrastructure/data-access/entities';
import { PaymentsPostgresPersistence } from './infrastructure/data-access/repositories';

export const PaymentsPostgresEntitySchemas = [
  PaymentProviderEntitySchema,
  PaymentEntitySchema,
  PaymentEventEntitySchema,
  PaymentWebhookReceiptEntitySchema,
  PaymentRefundEntitySchema,
  PaymentProviderHealthEntitySchema,
] as const;

/** Registers all payments tables and binds the storage-neutral persistence port. */
@Module({
  imports: [MikroOrmModule.forFeature([...PaymentsPostgresEntitySchemas])],
  providers: [PaymentsPostgresPersistence, { provide: PaymentsPersistence, useExisting: PaymentsPostgresPersistence }],
  exports: [MikroOrmModule, PaymentsPersistence, PaymentsPostgresPersistence],
})
export class PaymentsPostgresModule {}
