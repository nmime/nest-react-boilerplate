import type { NormalizedProviderStatus, NormalizedWebhookEvent } from './normalized-provider';

/**
 * The `PaymentProviderPort` contract every adapter implements (design §4.0).
 *
 * An abstract class rather than an interface: the class is its own DI token
 * (the fiat persistence-port pattern), the `useFactory` registry (U5) injects
 * every registered subclass, and the registry resolves by `providerCode` —
 * which must equal `payment_providers.code`.
 *
 * Amounts cross this port as decimal strings (design §2.2); adapters parse
 * and format them through `payment-money.ts` and nothing else.
 */

/** What a provider returns when it creates an invoice / checkout session. */
export interface ProviderCreatedPayment {
  readonly providerPaymentId: string;
  readonly payUrl?: string;
  readonly payAddress?: string;
  readonly payNetwork?: string;
  readonly payCurrency?: string;
  readonly expiresAt: Date | null;
  readonly redirect?: { type: 'url'; url: string } | { type: 'form'; url: string; fields: Record<string, string> };
  readonly providerStatusRaw: string;
}

/** The request context `createPayment` receives. */
export interface ProviderCreatePaymentRequest {
  /** OUR id — becomes clientInvoiceId / order_id / Idempotence-Key / reference. */
  paymentId: string;
  /** Decimal strings, exact (design §2.2). */
  amount: string;
  currency: string;
  payCurrency?: string;
  payNetworks?: string[];
  description: string;
  expiresInMs: number;
  webhookUrl: string;
  returnUrl?: { success?: string; cancel?: string };
  customer?: { id?: string; email?: string; telegramId?: string; telegramUsername?: string };
  meta?: Record<string, unknown>;
}

/** The provider-confirmed state `getStatus` reports (the double-check source). */
export interface ProviderPaymentStatus {
  status: NormalizedProviderStatus;
  paidAmount?: string;
  paidCurrency?: string;
  fee?: string;
  txid?: string;
  finalizedAt?: Date;
  providerStatusRaw: string;
}

/** The result of verifying a raw webhook delivery. */
export interface ProviderWebhookVerification {
  /** 'none' = the provider documents no signature scheme (X-Rocket, yookassa-v3). */
  result: 'valid' | 'invalid' | 'none';
  idempotencyKey: string;
  events: NormalizedWebhookEvent[];
}

export abstract class PaymentProviderPort {
  /** Must equal `payment_providers.code`. */
  abstract readonly providerCode: string;

  abstract createPayment(req: ProviderCreatePaymentRequest): Promise<ProviderCreatedPayment>;

  /** Crypto-only: the deposit address for a payment (may be unresolvable yet). */
  abstract resolvePaymentAddress?(req: {
    providerPaymentId?: string;
    clientId: string;
    payNetwork: string;
  }): Promise<{ address: string; payCurrency: string; payNetwork: string; expiresAt: Date; minAmount?: string } | null>;

  abstract getStatus(payment: { providerPaymentId?: string; clientId: string }): Promise<ProviderPaymentStatus>;

  abstract verifyWebhook(raw: {
    body: string;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<ProviderWebhookVerification>;

  abstract refund?(
    payment: { providerPaymentId: string },
    req: { amount: string; currency: string; reason?: string },
  ): Promise<{ providerRefundId?: string; status: 'requested' | 'confirmed' | 'failed'; providerStatusRaw: string }>;

  abstract closePayment?(payment: { providerPaymentId?: string; clientId: string }): Promise<{
    closed: boolean;
    providerStatusRaw: string;
  }>;
}
