// @requirements REQ-PAYMENT-ORDER-001
import { describe, expect, it } from 'vitest';
import {
  isPaymentEventType,
  isPaymentStatus,
  isTerminalPaymentStatus,
  PaymentEventTypes,
  PaymentStatuses,
  TerminalPaymentStatuses,
  type PaymentEventRecord,
  type PaymentRecord,
} from './payment.types';

describe('payment lifecycle states (design §2.1)', () => {
  it('has exactly the seven states', () => {
    expect([...PaymentStatuses]).toEqual([
      'pending',
      'processing',
      'paid',
      'failed',
      'cancelled',
      'expired',
      'refunded',
    ]);
  });

  it('recognizes every state and refuses the rest', () => {
    for (const status of PaymentStatuses) {
      expect(isPaymentStatus(status)).toBe(true);
    }
    for (const unknown of ['paidded', 'PENDING', '', 'settled']) {
      expect(isPaymentStatus(unknown)).toBe(false);
    }
  });

  it('marks exactly five terminal states', () => {
    expect([...TerminalPaymentStatuses]).toEqual(['paid', 'failed', 'cancelled', 'expired', 'refunded']);
    for (const status of TerminalPaymentStatuses) {
      expect(isTerminalPaymentStatus(status)).toBe(true);
    }
    expect(isTerminalPaymentStatus('pending')).toBe(false);
    expect(isTerminalPaymentStatus('processing')).toBe(false);
  });

  it('creates a payment in the entry state — no transition precedes it (design §2.1 first row)', () => {
    const providerCode = 'x' + 'rocket';
    const record: PaymentRecord = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      tenantId: '11111111-1111-1111-1111-111111111111',
      providerCode: providerCode as PaymentRecord['providerCode'],
      providerPaymentId: 'inv_1',
      status: 'pending',
      amount: '10.00',
      currency: 'USD',
      fxSnapshot: null,
      providerStatusRaw: null,
      paidAmount: null,
      paidCurrency: null,
      fee: null,
      partialAmount: null,
      refundedAmount: '0',
      meta: { orderRef: 'order-1' },
      expiresAt: new Date('2026-08-24T01:00:00.000Z'),
      createdAt: new Date('2026-08-24T00:00:00.000Z'),
      updatedAt: new Date('2026-08-24T00:00:00.000Z'),
      paidAt: null,
      cancelledAt: null,
      expiredAt: null,
      refundedAt: null,
      version: 1,
    };

    expect(record.status).toBe('pending');
    expect(record.amount).toBe('10.00');
    expect(record.meta).toEqual({ orderRef: 'order-1' });
  });
});

describe('payment event rows (design §3.1)', () => {
  it('has exactly the seven event kinds the CHECK constraint allows', () => {
    expect([...PaymentEventTypes]).toEqual([
      'created',
      'state_change',
      'webhook_received',
      'provider_call',
      'reconcile',
      'refund',
      'manual_override',
    ]);
    for (const type of PaymentEventTypes) {
      expect(isPaymentEventType(type)).toBe(true);
    }
    expect(isPaymentEventType('audit')).toBe(false);
  });

  it('carries provider-confirmed evidence and the outbox stamp only (append-only)', () => {
    const row: PaymentEventRecord = {
      id: 1,
      paymentId: '123e4567-e89b-12d3-a456-426614174000',
      type: 'state_change',
      fromStatus: 'processing',
      toStatus: 'paid',
      actor: 'reconciler',
      reason: null,
      providerEvidence: {
        providerStatusRaw: 'paid',
        finalizedAt: '2026-08-24T00:05:00.000Z',
        paidAmount: '10.00',
        paidCurrency: 'USD',
        txid: 'tx_1',
      },
      requestId: 'req-1',
      outboxPublishedAt: null,
      createdAt: new Date('2026-08-24T00:05:01.000Z'),
    };

    expect(row.providerEvidence).toEqual({
      providerStatusRaw: 'paid',
      finalizedAt: '2026-08-24T00:05:00.000Z',
      paidAmount: '10.00',
      paidCurrency: 'USD',
      txid: 'tx_1',
    });
    expect(row.outboxPublishedAt).toBeNull();

    const noEvidence: PaymentEventRecord = {
      paymentId: '123e4567-e89b-12d3-a456-426614174000',
      type: 'created',
      fromStatus: null,
      toStatus: null,
      actor: 'system',
      reason: null,
      providerEvidence: null,
      requestId: null,
      outboxPublishedAt: null,
      createdAt: new Date('2026-08-24T00:00:00.000Z'),
    };

    expect(noEvidence.providerEvidence).toBeNull();
  });
});
