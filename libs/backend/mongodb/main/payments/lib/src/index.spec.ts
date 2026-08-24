// @requirements REQ-PAYMENT-PROVIDER-005
import { describe, expect, it } from 'vitest';
import * as paymentsMongo from './index';

describe('MongoDB payments public API', () => {
  it('exports the collection, the migration, the repository, and the module', () => {
    expect(paymentsMongo).toMatchObject({
      PaymentsCollectionName: 'payments',
      PaymentsCreatedAtIndexName: 'ix__payments__created_at_id',
      PaymentsIndexes: expect.any(Array),
      PaymentsMongoModule: expect.any(Function),
      PaymentsRepository: expect.any(Function),
      initializePaymentsCollection: expect.any(Function),
      verifyPaymentsCollection: expect.any(Function),
      Migration20260823100000InitializePayments: expect.any(Object),
      paymentsMongoMigrations: expect.any(Array),
    });
  });
});
