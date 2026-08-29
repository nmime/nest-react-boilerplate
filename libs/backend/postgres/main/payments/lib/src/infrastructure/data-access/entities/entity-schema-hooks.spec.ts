// @requirements REQ-PAYMENT-ORDER-004 REQ-PAYMENT-PROVIDER-004
import { describe, expect, it } from 'vitest';
import {
  PaymentEntitySchema,
  PaymentProviderEntitySchema,
  PaymentProviderHealthEntitySchema,
  PaymentWebhookReceiptEntitySchema,
} from './index';

const invokeHook = (hook: unknown): unknown => (hook as (() => unknown) | undefined)?.();

describe('payments entity schema creation hooks', () => {
  it('stamps creation timestamps for mutable rows', () => {
    for (const schema of [
      PaymentEntitySchema,
      PaymentProviderEntitySchema,
      PaymentProviderHealthEntitySchema,
      PaymentWebhookReceiptEntitySchema,
    ]) {
      schema.init();
    }

    expect(invokeHook(PaymentEntitySchema.meta.properties.updatedAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeHook(PaymentProviderEntitySchema.meta.properties.updatedAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeHook(PaymentProviderHealthEntitySchema.meta.properties.updatedAt.onCreate)).toBeInstanceOf(Date);
    expect(invokeHook(PaymentWebhookReceiptEntitySchema.meta.properties.claimedAt.onCreate)).toBeInstanceOf(Date);
  });
});
