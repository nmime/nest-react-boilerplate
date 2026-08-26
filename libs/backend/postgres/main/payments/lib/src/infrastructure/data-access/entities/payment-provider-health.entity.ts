import { EntitySchema } from '@mikro-orm/core';
import type {
  PaymentProviderErrorClass,
  PaymentProviderHealthState,
  UpsertPaymentProviderHealthParams,
} from '@app/backend-feature-payments-shared';

export class PaymentProviderHealthEntity {
  providerCode!: string;
  state: PaymentProviderHealthState = 'unknown';
  consecutiveErrors = 0;
  lastSuccessAt: Date | null = null;
  lastErrorAt: Date | null = null;
  lastErrorClass: PaymentProviderErrorClass | null = null;
  updatedAt: Date = new Date();

  constructor(input?: UpsertPaymentProviderHealthParams) {
    if (!input) {
      return;
    }
    this.providerCode = input.providerCode;
    this.state = input.state;
    this.consecutiveErrors = input.consecutiveErrors;
    this.lastSuccessAt = input.lastSuccessAt ?? null;
    this.lastErrorAt = input.lastErrorAt ?? null;
    this.lastErrorClass = input.lastErrorClass ?? null;
    this.updatedAt = input.updatedAt ?? new Date();
  }
}

export const PaymentProviderHealthEntitySchema = new EntitySchema<PaymentProviderHealthEntity>({
  class: PaymentProviderHealthEntity,
  tableName: 'payment_provider_health',
  properties: {
    providerCode: { type: 'text', fieldName: 'provider_code', primary: true },
    state: { type: 'text', default: 'unknown' },
    consecutiveErrors: { type: 'integer', fieldName: 'consecutive_errors', default: 0 },
    lastSuccessAt: { type: 'timestamptz', fieldName: 'last_success_at', nullable: true },
    lastErrorAt: { type: 'timestamptz', fieldName: 'last_error_at', nullable: true },
    lastErrorClass: { type: 'text', fieldName: 'last_error_class', nullable: true },
    updatedAt: {
      type: 'timestamptz',
      fieldName: 'updated_at',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
});
