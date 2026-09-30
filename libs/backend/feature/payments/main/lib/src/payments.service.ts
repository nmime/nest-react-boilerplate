import { Injectable } from '@nestjs/common';
import { type CreatePaymentsDto, type PaymentsDto } from '@app/backend-feature-payments-shared';
import { PaymentCustomerUnavailableException } from './providers/provider-errors';

/** Customer orchestration is staged for U9; the legacy unscoped facade stays unavailable. */
/* v8 ignore next -- Nest's bare class-decorator helper has one synthetic branch. */
@Injectable()
export class PaymentsService {
  async list(): Promise<PaymentsDto[]> {
    throw new PaymentCustomerUnavailableException();
  }

  async create(_input: CreatePaymentsDto): Promise<PaymentsDto> {
    throw new PaymentCustomerUnavailableException();
  }
}
