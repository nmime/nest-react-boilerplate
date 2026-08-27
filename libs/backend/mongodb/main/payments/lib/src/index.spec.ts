// @requirements REQ-PAYMENT-PROVIDER-005
import { describe, expect, it } from 'vitest';
import * as paymentsMongo from './index';

describe('MongoDB payments public API', () => {
  it('exports the six collections, migration, verifier, repository, and module', () => {
    expect(paymentsMongo).toMatchObject({
      PaymentsCollectionName: 'payments',
      PaymentEventsCollectionName: 'payment_events',
      PaymentWebhookReceiptsCollectionName: 'payment_webhook_receipts',
      PaymentProvidersCollectionName: 'payment_providers',
      PaymentRefundsCollectionName: 'payment_refunds',
      PaymentProviderHealthCollectionName: 'payment_provider_health',
      PaymentsMongoMigrationVerifier: expect.any(Function),
      PaymentsMongoModule: expect.any(Function),
      PaymentsMongoPersistence: expect.any(Function),
      initializePaymentsCollections: expect.any(Function),
      verifyPaymentsCollections: expect.any(Function),
      Migration20260823100000InitializePayments: expect.any(Object),
      paymentsMongoMigrations: expect.any(Array),
    });
  });
});
