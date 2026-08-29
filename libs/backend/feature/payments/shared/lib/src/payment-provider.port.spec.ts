// @requirements REQ-PAYMENT-ORDER-001 REQ-PAYMENT-ORDER-003
import { describe, expect, it } from 'vitest';
import { PaymentProviderPort, type ProviderCreatedPayment } from './payment-provider.port';

/**
 * In-memory fake adapter that proves the port's shape (design §7.3): every
 * real adapter (U7 crypto, U8 fiat) implements this exact contract, and the
 * registry (U5) resolves providers by `providerCode` against it.
 */
class FakeProvider extends PaymentProviderPort {
  override readonly providerCode = 'fake';

  override async createPayment(req: {
    paymentId: string;
    amount: string;
    currency: string;
  }): Promise<ProviderCreatedPayment> {
    return {
      providerPaymentId: `fake-inv-${req.paymentId}`,
      payUrl: `https://fake.example/pay/${req.paymentId}`,
      expiresAt: new Date('2026-08-24T01:00:00.000Z'),
      redirect: { type: 'url', url: `https://fake.example/pay/${req.paymentId}` },
      providerStatusRaw: 'pending',
    };
  }

  override async resolvePaymentAddress(req: { providerPaymentId?: string; clientId: string; payNetwork: string }) {
    if (req.payNetwork === 'TON') {
      return {
        address: 'EQfake-address',
        payCurrency: 'TON',
        payNetwork: 'TON',
        expiresAt: new Date('2026-08-24T01:00:00.000Z'),
        minAmount: '0.000001',
      };
    }
    return null;
  }

  override async getStatus(payment: { providerPaymentId?: string; clientId: string }) {
    return {
      status: 'paid' as const,
      paidAmount: '10.00',
      paidCurrency: 'USD',
      fee: '0.30',
      txid: 'tx_1',
      finalizedAt: new Date('2026-08-24T00:05:00.000Z'),
      providerStatusRaw: 'paid',
    };
  }

  override async verifyWebhook(raw: { body: string; headers: Record<string, string | string[] | undefined> }) {
    return {
      result: 'none' as const,
      idempotencyKey: `fake:${raw.body.length}`,
      events: [{ providerStatusRaw: 'paid', eventTime: new Date('2026-08-24T00:04:00.000Z') }],
    };
  }

  override async refund(
    payment: { providerPaymentId: string },
    req: { amount: string; currency: string; reason?: string },
  ) {
    return {
      providerRefundId: `fake-ref-${payment.providerPaymentId}`,
      status: 'confirmed' as const,
      providerStatusRaw: 'refund_succeeded',
    };
  }

  override async closePayment(payment: { providerPaymentId?: string; clientId: string }) {
    return { closed: true, providerStatusRaw: 'deleted' };
  }
}

/** The minimal contract: the four required members only — optionals are optional. */
class MinimalProvider extends PaymentProviderPort {
  override readonly providerCode = 'minimal';

  // TS 6 requires concrete classes to declare inherited optional abstract
  // members; `undefined` is the "this adapter does not have the capability"
  // declaration.
  override readonly resolvePaymentAddress: undefined = undefined;
  override readonly refund: undefined = undefined;

  override async createPayment() {
    return { providerPaymentId: 'm-1', expiresAt: null, providerStatusRaw: 'pending' };
  }

  override async getStatus() {
    return { status: 'pending' as const, providerStatusRaw: 'pending' };
  }

  override async verifyWebhook() {
    return { result: 'invalid' as const, idempotencyKey: 'm-1:bad', events: [] };
  }

  override async closePayment() {
    return { closed: false, providerStatusRaw: 'pending' };
  }
}

describe('PaymentProviderPort (design §4.0)', () => {
  it('is an abstract token adapters extend, keyed by providerCode', () => {
    const provider: PaymentProviderPort = new FakeProvider();

    expect(provider).toBeInstanceOf(PaymentProviderPort);
    expect(provider.providerCode).toBe('fake');
  });

  it('createPayment returns the created-payment shape with our id as the provider invoice id', async () => {
    const created = await new FakeProvider().createPayment({ paymentId: '123e4567', amount: '10.00', currency: 'USD' });

    expect(created).toEqual({
      providerPaymentId: 'fake-inv-123e4567',
      payUrl: 'https://fake.example/pay/123e4567',
      expiresAt: new Date('2026-08-24T01:00:00.000Z'),
      redirect: { type: 'url', url: 'https://fake.example/pay/123e4567' },
      providerStatusRaw: 'pending',
    });
  });

  it('resolvePaymentAddress resolves a crypto deposit address or reports it unavailable', async () => {
    const provider = new FakeProvider();

    await expect(provider.resolvePaymentAddress({ clientId: '123e4567', payNetwork: 'TON' })).resolves.toEqual({
      address: 'EQfake-address',
      payCurrency: 'TON',
      payNetwork: 'TON',
      expiresAt: new Date('2026-08-24T01:00:00.000Z'),
      minAmount: '0.000001',
    });
    await expect(provider.resolvePaymentAddress({ clientId: '123e4567', payNetwork: 'BSC' })).resolves.toBeNull();
  });

  it('getStatus is the double-check source: provider-confirmed values only (invariant 2)', async () => {
    const status = await new FakeProvider().getStatus({ clientId: '123e4567' });

    expect(status).toEqual({
      status: 'paid',
      paidAmount: '10.00',
      paidCurrency: 'USD',
      fee: '0.30',
      txid: 'tx_1',
      finalizedAt: new Date('2026-08-24T00:05:00.000Z'),
      providerStatusRaw: 'paid',
    });
  });

  it('verifyWebhook reports the signature result, the idempotency key, and normalized events', async () => {
    const verification = await new FakeProvider().verifyWebhook({ body: '{"id":"e1"}', headers: {} });

    expect(verification.result).toBe('none');
    expect(verification.idempotencyKey).toBe('fake:11');
    expect(verification.events).toEqual([
      { providerStatusRaw: 'paid', eventTime: new Date('2026-08-24T00:04:00.000Z') },
    ]);
  });

  it('refund and closePayment are capabilities an adapter may or may not implement', async () => {
    const full = new FakeProvider();
    const minimal: PaymentProviderPort = new MinimalProvider();

    expect(typeof full.refund).toBe('function');
    expect(typeof full.closePayment).toBe('function');
    await expect(
      full.refund({ providerPaymentId: 'fake-inv-1' }, { amount: '10.00', currency: 'USD' }),
    ).resolves.toEqual({
      providerRefundId: 'fake-ref-fake-inv-1',
      status: 'confirmed',
      providerStatusRaw: 'refund_succeeded',
    });
    await expect(full.closePayment({ clientId: '123e4567' })).resolves.toEqual({
      closed: true,
      providerStatusRaw: 'deleted',
    });

    expect(minimal.refund).toBeUndefined();
    expect(typeof minimal.closePayment).toBe('function');
    await expect(minimal.closePayment?.({ clientId: '123e4567' })).resolves.toEqual({
      closed: false,
      providerStatusRaw: 'pending',
    });
  });
});
