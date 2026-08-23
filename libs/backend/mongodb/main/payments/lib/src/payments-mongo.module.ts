import { Module } from '@nestjs/common';
import { PaymentsRepository } from './payments-mongo.repository';

@Module({
  providers: [PaymentsRepository],
  exports: [PaymentsRepository],
})
export class PaymentsMongoModule {}
