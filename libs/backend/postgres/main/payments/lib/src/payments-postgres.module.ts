import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { PaymentsPersistence } from '@app/backend-feature-payments-shared';
import { PaymentsEntitySchema } from './infrastructure/data-access/entities';
import { PaymentsPostgresPersistence } from './infrastructure/data-access/repositories';

/**
 * Registers the payments tables and binds the persistence port.
 *
 * The feature module consumes {@link PaymentsPersistence}, never this class, which is what lets
 * the same service run unchanged on the MongoDB axis.
 */
@Module({
  imports: [MikroOrmModule.forFeature([PaymentsEntitySchema])],
  providers: [PaymentsPostgresPersistence, { provide: PaymentsPersistence, useExisting: PaymentsPostgresPersistence }],
  exports: [MikroOrmModule, PaymentsPersistence, PaymentsPostgresPersistence],
})
export class PaymentsPostgresModule {}
