import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { PaymentsEntitySchema } from './infrastructure/data-access/entities';
import { PaymentsRepository } from './infrastructure/data-access/repositories';

@Module({
  imports: [MikroOrmModule.forFeature([PaymentsEntitySchema])],
  providers: [PaymentsRepository],
  exports: [MikroOrmModule, PaymentsRepository],
})
export class PaymentsPostgresModule {}
