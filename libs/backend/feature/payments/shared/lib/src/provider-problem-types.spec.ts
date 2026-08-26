// @requirements REQ-PAYMENT-ORDER-001 REQ-PAYMENT-ORDER-004
import {
  getProblemTypeDefinition,
  problemTypeForCode,
  registerProblemTypes,
  registeredProblemTypeDefinitions,
} from '@app/common-problem-details';
import { describe, expect, it } from 'vitest';
import { PaymentProblemCodes, registerPaymentProblemTypes } from './provider-problem-types';

/**
 * The fifteen payment problem types (design §5.1), registered into
 * @app/common-problem-details and asserted code by code: every code a
 * payment failure can raise is documented problem+json before the U5/U9
 * exception classes may reference it.
 */
registerPaymentProblemTypes();

/** The §5.1 status per problem code — the exact contract. */
const ExpectedStatus = new Map<string, number>([
  ['payment-provider-unavailable', 503],
  ['payment-provider-rate-limited', 503],
  ['payment-provider-credential-invalid', 503],
  ['payment-provider-capability', 503],
  ['payment-amount-invalid', 400],
  ['payment-currency-unavailable', 400],
  ['payment-expired', 409],
  ['payment-already-paid', 409],
  ['payment-refund-window-closed', 409],
  ['payment-fx-unavailable', 503],
  ['payment-not-found', 404],
  ['webhook-signature-invalid', 400],
  ['webhook-replayed', 409],
  ['webhook-stale', 410],
  ['webhook-processing-error', 502],
]);

describe('payment problem types (design §5.1)', () => {
  it('declares exactly the fifteen codes, each once', () => {
    expect(PaymentProblemCodes).toHaveLength(15);
    expect(new Set(PaymentProblemCodes).size).toBe(15);
    for (const code of PaymentProblemCodes) {
      expect(ExpectedStatus.has(code)).toBe(true);
    }
    for (const code of ExpectedStatus.keys()) {
      expect(PaymentProblemCodes).toContain(code);
    }
  });

  it('registers every code into the common catalog with its §5.1 status', () => {
    for (const code of PaymentProblemCodes) {
      const definition = getProblemTypeDefinition(code);
      expect(definition, `definition for ${code}`).toBeDefined();
      expect(definition?.status).toBe(ExpectedStatus.get(code));
      expect(typeof definition?.title).toBe('string');
      expect((definition?.title ?? '').trim().length).toBeGreaterThan(0);
      expect((definition?.detail ?? '').trim().length).toBeGreaterThan(0);
      expect((definition?.resolution ?? '').trim().length).toBeGreaterThan(0);
      expect(definition?.extensions.map((extension) => extension.name)).toContain('code');
      expect(problemTypeForCode(code)).toBe(`https://example.com/problems#${code}`);
    }
  });

  it('carries the retryAfterSeconds extension only on payment-provider-rate-limited', () => {
    for (const code of PaymentProblemCodes) {
      const names = getProblemTypeDefinition(code)?.extensions.map((extension) => extension.name) ?? [];
      if (code === 'payment-provider-rate-limited') {
        expect(names).toContain('retryAfterSeconds');
      } else {
        expect(names).not.toContain('retryAfterSeconds');
      }
    }
  });

  it('keeps the base catalog intact: 6 base + 15 payment definitions composed', () => {
    const definitions = registeredProblemTypeDefinitions();
    expect(definitions).toHaveLength(21);
    const codes = definitions.map((definition) => definition.code);
    for (const code of PaymentProblemCodes) {
      expect(codes).toContain(code);
    }
  });

  it('registers once: a second registration throws and leaves the catalog untouched', () => {
    expect(() => {
      registerPaymentProblemTypes();
    }).toThrow(/already registered/);
    expect(registeredProblemTypeDefinitions()).toHaveLength(21);

    const other = {
      id: 'payments-spec-other',
      problems: [
        {
          code: 'payments-spec-other',
          title: 'Other',
          status: 418,
          detail: 'A different product namespace.',
          resolution: 'Nothing.',
          extensions: [{ name: 'code', description: 'Stable short alias for the problem type URI.' }],
        },
      ],
    };
    registerProblemTypes(other);
    expect(getProblemTypeDefinition('payments-spec-other')?.status).toBe(418);
  });
});
