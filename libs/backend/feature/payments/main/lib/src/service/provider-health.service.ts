import {
  type PaymentProviderErrorClass,
  type PaymentProviderHealthRecord,
  type PaymentProviderHealthState,
  PaymentsPersistence,
} from '@app/backend-feature-payments-shared';

const ErrorWindowMs = 10 * 60 * 1_000;
const DownErrorThreshold = 5;

function unknownHealth(providerCode: string, at: Date): PaymentProviderHealthRecord {
  return {
    providerCode,
    state: 'unknown',
    consecutiveErrors: 0,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorClass: null,
    updatedAt: at,
  };
}

function isDegradingError(errorClass: PaymentProviderErrorClass | null): boolean {
  return errorClass === 'server' || errorClass === 'timeout';
}

/** Persists the health evidence that new-payment routing consumes. */
export class ProviderHealthService {
  constructor(private readonly persistence: PaymentsPersistence) {}

  async get(providerCode: string, at = new Date()): Promise<PaymentProviderHealthRecord> {
    return (await this.persistence.findPaymentProviderHealth(providerCode)) ?? unknownHealth(providerCode, at);
  }

  async recordSuccess(providerCode: string, at = new Date()): Promise<PaymentProviderHealthRecord> {
    const current = await this.get(providerCode, at);
    const state: PaymentProviderHealthState = current.state === 'disabled' ? 'disabled' : 'up';
    return this.persistence.upsertPaymentProviderHealth({
      providerCode,
      state,
      consecutiveErrors: 0,
      lastSuccessAt: at,
      updatedAt: at,
    });
  }

  async recordError(
    providerCode: string,
    errorClass: PaymentProviderErrorClass,
    at = new Date(),
  ): Promise<PaymentProviderHealthRecord> {
    const current = await this.get(providerCode, at);
    const insideWindow = current.lastErrorAt !== null && at.getTime() - current.lastErrorAt.getTime() <= ErrorWindowMs;
    const consecutiveErrors = insideWindow ? current.consecutiveErrors + 1 : 1;

    let state = current.state;
    if (state !== 'disabled') {
      if (state === 'down' || errorClass === 'auth' || consecutiveErrors >= DownErrorThreshold) {
        state = 'down';
      } else if (consecutiveErrors >= 2 && isDegradingError(errorClass) && isDegradingError(current.lastErrorClass)) {
        state = 'degraded';
      }
    }

    return this.persistence.upsertPaymentProviderHealth({
      providerCode,
      state,
      consecutiveErrors,
      lastErrorAt: at,
      lastErrorClass: errorClass,
      updatedAt: at,
    });
  }

  async setDisabled(providerCode: string, disabled: boolean, at = new Date()): Promise<PaymentProviderHealthRecord> {
    return this.persistence.upsertPaymentProviderHealth({
      providerCode,
      state: disabled ? 'disabled' : 'unknown',
      consecutiveErrors: 0,
      lastErrorAt: null,
      lastErrorClass: null,
      updatedAt: at,
    });
  }
}
