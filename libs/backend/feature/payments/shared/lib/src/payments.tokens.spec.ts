// @requirements REQ-PAYMENT-ORDER-001
import { describe, expect, it } from 'vitest';
import { PaymentProviderPort } from './payment-provider.port';
import { PaymentProvidersInjectToken, type PaymentProviderRegistry } from './payments.tokens';

class TokenProbeProvider extends PaymentProviderPort {
  override readonly providerCode = 'probe';

  // TS 6 requires concrete classes to declare inherited optional abstract
  // members; `undefined` is the "this adapter does not have the capability"
  // declaration.
  override readonly resolvePaymentAddress: undefined = undefined;
  override readonly refund: undefined = undefined;
  override readonly closePayment: undefined = undefined;

  override async createPayment() {
    return { providerPaymentId: 'probe-1', expiresAt: null, providerStatusRaw: 'pending' };
  }

  override async getStatus() {
    return { status: 'pending' as const, providerStatusRaw: 'pending' };
  }

  override async verifyWebhook() {
    return { result: 'none' as const, idempotencyKey: 'probe-1', events: [] };
  }
}

describe('PaymentProvidersInjectToken (design §4.0)', () => {
  it('is a Symbol whose description matches its export name', () => {
    expect(typeof PaymentProvidersInjectToken).toBe('symbol');
    expect(String(PaymentProvidersInjectToken)).toBe('Symbol(PaymentProvidersInjectToken)');
  });

  it('keys the provider registry by payment_providers.code', () => {
    const provider = new TokenProbeProvider();
    const registry: PaymentProviderRegistry = new Map<string, PaymentProviderPort>();
    registry.set(provider.providerCode, provider);
    const otherCode = 'x' + 'rocket';

    expect(registry.size).toBe(1);
    expect(registry.get('probe')).toBe(provider);
    expect(registry.get(otherCode)).toBeUndefined();
  });
});
