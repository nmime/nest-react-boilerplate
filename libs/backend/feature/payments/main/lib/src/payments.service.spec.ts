// @requirements REQ-PAYMENT-ORDER-003 REQ-PAYMENT-ORDER-004 REQ-PAYMENT-PROVIDER-005
import { describe, expect, it } from 'vitest';
import { PaymentsService } from './payments.service';
import { PaymentCustomerUnavailableException } from './providers/provider-errors';

describe('PaymentsService preactivation boundary', () => {
  it('cannot expose unscoped reads or fabricate zero-value customer payments', async () => {
    const service = new PaymentsService();
    await expect(service.list()).rejects.toBeInstanceOf(PaymentCustomerUnavailableException);
    await expect(service.create({ name: 'Example' })).rejects.toBeInstanceOf(PaymentCustomerUnavailableException);
    await expect(service.list()).rejects.toMatchObject({ status: 503, code: 'payment-customer-unavailable' });
  });
});
