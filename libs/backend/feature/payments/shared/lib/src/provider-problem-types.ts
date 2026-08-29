import { registerProblemTypes, type ProblemTypeExtension } from '@app/common-problem-details';

/**
 * The fifteen payment problem types (design §5.1).
 *
 * Registered into `@app/common-problem-details`' product namespace so every
 * payment failure is RFC 9457 problem+json before a controller raises it. The
 * payments module calls {@link registerPaymentProblemTypes} at boot (U5); the
 * `Exception` factory refuses a problem type nobody registered, so an
 * unregistered payment error fails at class-definition time, not on the
 * failing request.
 */

export const PaymentProblemCodes = [
  'payment-provider-unavailable',
  'payment-provider-rate-limited',
  'payment-provider-credential-invalid',
  'payment-provider-capability',
  'payment-amount-invalid',
  'payment-currency-unavailable',
  'payment-expired',
  'payment-already-paid',
  'payment-refund-window-closed',
  'payment-fx-unavailable',
  'payment-not-found',
  'webhook-signature-invalid',
  'webhook-replayed',
  'webhook-stale',
  'webhook-processing-error',
] as const;

export type PaymentProblemCode = (typeof PaymentProblemCodes)[number];

const CodeExtension = { name: 'code', description: 'Stable short alias for the problem type URI.' } as const;

const PaymentProblemTypesExtension: ProblemTypeExtension = {
  id: 'payments',
  problems: [
    {
      code: 'payment-provider-unavailable',
      title: 'Payment Provider Unavailable',
      status: 503,
      detail:
        'No eligible payment provider (disabled, missing, health down, or region-denied) could serve the request.',
      resolution:
        'Enable or repair a provider in the registry, then retry. In-flight payments settle through webhooks and the reconciler regardless.',
      extensions: [CodeExtension],
    },
    {
      code: 'payment-provider-rate-limited',
      title: 'Payment Provider Rate Limited',
      status: 503,
      detail:
        'The payment provider refused the request with a rate-limit response after the retry budget was exhausted.',
      resolution: 'Retry after the duration indicated by the retryAfterSeconds extension.',
      extensions: [
        CodeExtension,
        { name: 'retryAfterSeconds', description: 'How long to wait before retrying, from the provider response.' },
      ],
    },
    {
      code: 'payment-provider-credential-invalid',
      title: 'Payment Provider Credential Invalid',
      status: 503,
      detail:
        'The payment provider rejected its stored credentials; the provider is failed closed until they are repaired.',
      resolution:
        'Rotate the provider credentials in the admin surface. Never reported to customers as an authentication error.',
      extensions: [CodeExtension],
    },
    {
      code: 'payment-provider-capability',
      title: 'Payment Provider Capability Unavailable',
      status: 503,
      detail:
        'The selected payment provider does not support the requested operation for this currency, network, or configuration.',
      resolution: 'Pick a provider that supports the operation or adjust the provider configuration, then retry.',
      extensions: [CodeExtension],
    },
    {
      code: 'payment-amount-invalid',
      title: 'Payment Amount Invalid',
      status: 400,
      detail: 'The requested payment amount is not a valid exact decimal amount for the currency.',
      resolution: 'Correct the amount to a decimal string within the currency precision and resubmit.',
      extensions: [CodeExtension],
    },
    {
      code: 'payment-currency-unavailable',
      title: 'Payment Currency Unavailable',
      status: 400,
      detail: 'The requested currency or asset is not in the provider runtime list.',
      resolution: 'Use a currency or asset the selected provider supports, or pick a provider that supports it.',
      extensions: [CodeExtension],
    },
    {
      code: 'payment-expired',
      title: 'Payment Expired',
      status: 409,
      detail: 'The operation targets a payment that has already expired.',
      resolution: 'Create a new payment for the order instead of retrying the expired one.',
      extensions: [CodeExtension],
    },
    {
      code: 'payment-already-paid',
      title: 'Payment Already Paid',
      status: 409,
      detail:
        'The operation conflicts with a payment the provider has already confirmed as paid, including a late paid report on a closed payment.',
      resolution:
        'Do not cancel or void the payment; process the confirmed payment and reconcile manually if the report arrived after close.',
      extensions: [CodeExtension],
    },
    {
      code: 'payment-refund-window-closed',
      title: 'Payment Refund Window Closed',
      status: 409,
      detail: 'The provider refund window for this payment has passed.',
      resolution: 'Refund through the provider support or manual settlement process documented for the provider.',
      extensions: [CodeExtension],
    },
    {
      code: 'payment-fx-unavailable',
      title: 'Payment FX Quote Unavailable',
      status: 503,
      detail: 'No fiat-currency rate quote existed at creation time, so the payment could not be priced.',
      resolution: 'Seed the currency in the fiat-currency catalogue, then retry the payment.',
      extensions: [CodeExtension],
    },
    {
      code: 'payment-not-found',
      title: 'Payment Not Found',
      status: 404,
      detail: 'No payment with the requested identifier exists for the caller.',
      resolution: 'Verify the payment identifier and that the caller is allowed to discover the payment.',
      extensions: [CodeExtension],
    },
    {
      code: 'webhook-signature-invalid',
      title: 'Webhook Signature Invalid',
      status: 400,
      detail: 'The webhook delivery failed signature verification or did not route to a known provider.',
      resolution:
        'Check the provider webhook configuration and signature secret; the delivery is recorded and raised as a P1.',
      extensions: [CodeExtension],
    },
    {
      code: 'webhook-replayed',
      title: 'Webhook Replayed',
      status: 409,
      detail: 'A duplicate webhook delivery arrived while the original delivery was still being processed.',
      resolution: 'Retry later; the duplicate is accepted once the original delivery has been applied.',
      extensions: [CodeExtension],
    },
    {
      code: 'webhook-stale',
      title: 'Webhook Stale',
      status: 410,
      detail: 'The webhook event is older than the freshness window and its payment is already terminal.',
      resolution: 'Drop the event from the provider queue; the payment state is final.',
      extensions: [CodeExtension],
    },
    {
      code: 'webhook-processing-error',
      title: 'Webhook Processing Error',
      status: 502,
      detail: 'The webhook receipt could not be persisted, so nothing was committed.',
      resolution: 'Redeliver the webhook; it will be processed once persistence is healthy.',
      extensions: [CodeExtension],
    },
  ],
};

/**
 * Register all fifteen payment problem types. Called once at boot by the
 * payments module; a second call throws, matching the registry contract.
 */
export function registerPaymentProblemTypes(): void {
  registerProblemTypes(PaymentProblemTypesExtension);
}
