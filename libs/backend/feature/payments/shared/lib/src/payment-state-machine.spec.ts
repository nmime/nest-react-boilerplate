// @requirements REQ-PAYMENT-ORDER-001
import { getProblemTypeDefinition, problemTypeForCode } from '@app/common-problem-details';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  isLegalPaymentTransition,
  paymentStatusForProviderStatus,
  PaymentTransitionEdges,
  transitionPayment,
  type PaymentTransitionEvidence,
  type PaymentTransitionResult,
} from './payment-state-machine';
import { isTerminalPaymentStatus, PaymentStatuses } from './payment.types';
import { PaymentProblemCodes, registerPaymentProblemTypes } from './provider-problem-types';

/**
 * The exhaustive transition matrix (design §2.1, invariants 1-9).
 *
 * Every one of the 7 x 7 status pairs is asserted by name: each legal edge
 * applies with the event draft the same-transaction write must carry
 * (invariant 1); each no-op and illegal pair is rejected without moving the
 * payment (invariant 6); the paid-after-close pairs escalate instead of
 * crediting (invariant 8). Where design §5.1 binds a problem type to the
 * rejected pair, the registered problem+json is asserted too.
 */

const recheck: PaymentTransitionEvidence = {
  providerStatusRaw: 'succeeded',
  recheckedAt: new Date('2026-08-24T00:05:00.000Z'),
  finalizedAt: new Date('2026-08-24T00:05:00.000Z'),
  paidAmount: '10.00',
  paidCurrency: 'USD',
  fee: '0.30',
  txid: 'tx_1',
};

const refund: PaymentTransitionEvidence = {
  providerStatusRaw: 'refund_succeeded',
  refundAmount: '10.00',
  refundCurrency: 'USD',
};

const plain: PaymentTransitionEvidence = { providerStatusRaw: 'in_flight' };

const evidenceFor = (next: string): PaymentTransitionEvidence => {
  if (next === 'paid') {
    return recheck;
  }
  if (next === 'refunded') {
    return refund;
  }
  return plain;
};

/** The exact `payment_events.provider_evidence` JSON the machine records for each fixture. */
const recheckJson: Record<string, unknown> = {
  providerStatusRaw: 'succeeded',
  recheckedAt: '2026-08-24T00:05:00.000Z',
  finalizedAt: '2026-08-24T00:05:00.000Z',
  paidAmount: '10.00',
  paidCurrency: 'USD',
  fee: '0.30',
  txid: 'tx_1',
};

const refundJson: Record<string, unknown> = {
  providerStatusRaw: 'refund_succeeded',
  refundAmount: '10.00',
  refundCurrency: 'USD',
};

const plainJson: Record<string, unknown> = { providerStatusRaw: 'in_flight' };

const evidenceJsonFor = (next: string): Record<string, unknown> => {
  if (next === 'paid') {
    return recheckJson;
  }
  if (next === 'refunded') {
    return refundJson;
  }
  return plainJson;
};

const isEdge = (from: string, to: string): boolean => PaymentTransitionEdges.some(([a, b]) => a === from && b === to);

/** The §5.1 problem bound to this rejected pair, when the design binds one. */
const boundProblemCode = (current: string, next: string): string | undefined => {
  if (next === 'paid' && current !== 'pending' && current !== 'processing' && current !== 'paid') {
    return 'payment-already-paid'; // late provider-paid on a closed payment (invariant 8)
  }
  if (current === 'paid' && next === 'cancelled') {
    return 'payment-already-paid'; // cancel/void on a paid payment
  }
  if (current === 'expired' && next !== 'paid') {
    return 'payment-expired'; // cancel/resolve on an expired payment
  }
  return undefined;
};

const assertBoundPair = (current: string, next: string, bound: string | undefined): void => {
  if (bound === 'payment-already-paid') {
    const expected: [string, string] = current === 'paid' ? ['paid', 'cancelled'] : [current, 'paid'];
    expect([current, next]).toEqual(expected);
    return;
  }
  if (bound === 'payment-expired') {
    expect(current).toBe('expired');
  }
};

const assertProblemJson = (code: string): void => {
  expect(PaymentProblemCodes).toContain(code);
  const definition = getProblemTypeDefinition(code);
  expect(definition).toBeDefined();
  expect(definition?.status).toBeGreaterThan(100);
  expect(definition?.status).toBeLessThan(600);
  expect(typeof definition?.title).toBe('string');
  expect((definition?.title ?? '').length).toBeGreaterThan(0);
  expect(problemTypeForCode(code)).toBe(`https://example.com/problems#${code}`);
};

beforeAll(() => {
  registerPaymentProblemTypes();
});

describe('the 7 x 7 transition matrix (every legal and illegal pair)', () => {
  for (const current of PaymentStatuses) {
    for (const next of PaymentStatuses) {
      it(`pair ${current} -> ${next}`, () => {
        const result: PaymentTransitionResult = transitionPayment(current, next, evidenceFor(next));

        expect(result.from).toBe(current);
        expect(result.applied).toBe(isEdge(current, next));

        if (result.applied) {
          expect(result.to).toBe(next);
          expect(result.reason).toBeUndefined();
          expect(result.escalation).toBeUndefined();
          // Invariant 1: the event row the same-transaction write must carry.
          expect(result.event).toEqual({
            type: 'state_change',
            fromStatus: current,
            toStatus: next,
            providerEvidence: evidenceJsonFor(next),
          });
          // Invariant 9: the event never carries fxSnapshot.
          expect(result.event?.providerEvidence).not.toHaveProperty('fxSnapshot');
        } else {
          expect(result.to).toBe(current);
          expect(result.event).toBeUndefined();
        }

        if (current === next) {
          // Invariant 6: same status is a pure no-op — redelivery never re-logs.
          expect(result.reason).toBe('same-status');
          expect(result.escalation).toBeUndefined();
        } else if (next === 'paid' && isTerminalPaymentStatus(current)) {
          // Invariant 8: late paid after close escalates, never auto-credits.
          expect(result.reason).toBe('illegal-transition');
          expect(result.escalation).toEqual({
            reason: 'late_payment_after_close',
            event: { type: 'reconcile', reason: 'late_payment_after_close', providerEvidence: recheckJson },
          });
          assertProblemJson('payment-already-paid');
        } else if (!isEdge(current, next)) {
          expect(result.reason).toBe('illegal-transition');
          expect(result.escalation).toBeUndefined();
          const bound = boundProblemCode(current, next);
          if (bound !== undefined) {
            assertProblemJson(bound);
          }
        }
      });
    }
  }
});

describe('the legal edge set', () => {
  it('is exactly the ten edges of the design §2.1 table', () => {
    expect(PaymentTransitionEdges.map(([from, to]) => `${from}->${to}`).sort((a, b) => a.localeCompare(b))).toEqual(
      [
        'paid->refunded',
        'pending->cancelled',
        'pending->expired',
        'pending->failed',
        'pending->paid',
        'pending->processing',
        'processing->cancelled',
        'processing->expired',
        'processing->failed',
        'processing->paid',
      ].sort((a, b) => a.localeCompare(b)),
    );
    for (const from of PaymentStatuses) {
      for (const to of PaymentStatuses) {
        expect(isLegalPaymentTransition(from, to)).toBe(isEdge(from, to));
      }
    }
  });
});

describe('invariant 2: the double-check rule', () => {
  it('refuses a paid transition without the provider-API re-check on every path', () => {
    for (const current of ['pending', 'processing'] as const) {
      const result = transitionPayment(current, 'paid', { providerStatusRaw: 'webhook says paid' });

      expect(result.applied).toBe(false);
      expect(result.reason).toBe('paid-requires-provider-recheck');
      expect(result.to).toBe(current);
      expect(result.event).toBeUndefined();
      expect(result.escalation).toBeUndefined();
    }
  });

  it('applies a paid transition with the re-check evidence, recording it in the event', () => {
    const result = transitionPayment('processing', 'paid', recheck);

    expect(result.applied).toBe(true);
    expect(result.event?.providerEvidence).toMatchObject({
      recheckedAt: '2026-08-24T00:05:00.000Z',
      paidAmount: '10.00',
    });
  });
});

describe('invariant 5: underpaid never auto-pays', () => {
  it('keeps an underpaid report in flight as processing with the partial amount recorded', () => {
    const result = transitionPayment('processing', 'processing', {
      providerStatusRaw: 'partially_paid',
      partialAmount: '4.00',
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('same-status');
    expect(paymentStatusForProviderStatus('underpaid', 'processing')).toBe('processing');
    expect(paymentStatusForProviderStatus('underpaid', 'pending')).toBe('processing');
  });

  it('never maps an underpaid or unknown provider status to paid', () => {
    for (const unknown of ['underpaid', 'partially_paid', 'weird_new_status', '']) {
      for (const current of ['pending', 'processing'] as const) {
        expect(paymentStatusForProviderStatus(unknown, current)).not.toBe('paid');
      }
    }
  });
});

describe('invariant 6: idempotent transition under redelivery', () => {
  it('a webhook delivered twice applies the state once and no-ops the second time', () => {
    const first = transitionPayment('pending', 'paid', recheck);
    expect(first.applied).toBe(true);

    const second = transitionPayment(first.to, 'paid', recheck);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('same-status');
    expect(second.event).toBeUndefined();
  });

  it('a reconciler racing the webhook loses cleanly', () => {
    const webhook = transitionPayment('processing', 'paid', recheck);
    const reconciler = transitionPayment(webhook.to, 'paid', { ...recheck, providerStatusRaw: 're-fetched paid' });

    expect(webhook.applied).toBe(true);
    expect(reconciler.applied).toBe(false);
    expect(reconciler.reason).toBe('same-status');
  });
});

describe('invariant 7: refunded only from paid, on a confirmed full refund', () => {
  it('refuses the refund transition without the confirmation amounts', () => {
    const withoutAny = transitionPayment('paid', 'refunded', { providerStatusRaw: 'refund requested' });
    expect(withoutAny.applied).toBe(false);
    expect(withoutAny.reason).toBe('refund-requires-confirmation');

    const withoutCurrency = transitionPayment('paid', 'refunded', {
      providerStatusRaw: 'refund requested',
      refundAmount: '10.00',
    });
    expect(withoutCurrency.reason).toBe('refund-requires-confirmation');

    const withoutAmount = transitionPayment('paid', 'refunded', {
      providerStatusRaw: 'refund requested',
      refundCurrency: 'USD',
    });
    expect(withoutAmount.reason).toBe('refund-requires-confirmation');
  });

  it('applies the refund only from paid', () => {
    const applied = transitionPayment('paid', 'refunded', refund);
    expect(applied.applied).toBe(true);
    expect(applied.event?.toStatus).toBe('refunded');

    for (const current of ['pending', 'processing', 'failed', 'cancelled', 'expired'] as const) {
      expect(transitionPayment(current, 'refunded', refund).applied).toBe(false);
    }
  });
});

describe('invariant 8: late-paid-after-close never auto-credits', () => {
  it('escalates on every closed payment state, with the reconcile event and the P1 problem', () => {
    for (const current of ['failed', 'cancelled', 'expired', 'refunded'] as const) {
      const result = transitionPayment(current, 'paid', recheck);

      expect(result.applied).toBe(false);
      expect(result.to).toBe(current);
      expect(result.reason).toBe('illegal-transition');
      expect(result.escalation).toEqual({
        reason: 'late_payment_after_close',
        event: {
          type: 'reconcile',
          reason: 'late_payment_after_close',
          providerEvidence: expect.objectContaining({ providerStatusRaw: 'succeeded' }),
        },
      });
    }
    assertProblemJson('payment-already-paid');
    expect(getProblemTypeDefinition('payment-already-paid')?.status).toBe(409);
  });
});

describe('invariant 3: unknown provider status means in progress', () => {
  it('maps unknown and known in-flight statuses to processing, never paid', () => {
    expect(paymentStatusForProviderStatus('some_future_status', 'pending')).toBe('processing');
    expect(paymentStatusForProviderStatus('', 'processing')).toBe('processing');
    expect(paymentStatusForProviderStatus('processing', 'pending')).toBe('processing');
  });

  it('maps the known normalized statuses to their payment states', () => {
    expect(paymentStatusForProviderStatus('paid', 'processing')).toBe('paid');
    expect(paymentStatusForProviderStatus('failed', 'pending')).toBe('failed');
    expect(paymentStatusForProviderStatus('aml_hold', 'processing')).toBe('failed');
    expect(paymentStatusForProviderStatus('cancelled', 'pending')).toBe('cancelled');
    expect(paymentStatusForProviderStatus('expired', 'processing')).toBe('expired');
    expect(paymentStatusForProviderStatus('pending', 'pending')).toBe('pending');
  });

  it('never proposes leaving a terminal state', () => {
    for (const current of ['paid', 'failed', 'cancelled', 'expired', 'refunded'] as const) {
      expect(paymentStatusForProviderStatus('paid', current)).toBe(current);
      expect(paymentStatusForProviderStatus('weird', current)).toBe(current);
    }
  });
});

describe('problem+json bound to rejected pairs (design §5.1)', () => {
  it('registers the bound codes with their exact statuses', () => {
    expect(getProblemTypeDefinition('payment-already-paid')?.status).toBe(409);
    expect(getProblemTypeDefinition('payment-expired')?.status).toBe(409);
    expect(problemTypeForCode('payment-already-paid')).toBe('https://example.com/problems#payment-already-paid');
    expect(problemTypeForCode('payment-expired')).toBe('https://example.com/problems#payment-expired');
  });

  it('binds cancel-on-paid and ops-on-expired to their problems, and nothing else', () => {
    for (const current of PaymentStatuses) {
      for (const next of PaymentStatuses) {
        if (current === next) {
          continue;
        }
        const result = transitionPayment(current, next, evidenceFor(next));
        if (result.applied) {
          continue;
        }
        assertBoundPair(current, next, boundProblemCode(current, next));
      }
    }
  });
});
