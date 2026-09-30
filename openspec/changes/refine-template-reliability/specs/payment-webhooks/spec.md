## MODIFIED Requirements

### Requirement: [REQ-PAYMENT-WEBHOOK-003] No webhook alone pays a payment

For every event that would move a payment to `paid`, the system SHALL
re-verify through the provider API (`getStatus` re-fetch) before the
transition applies. For the signed fiat webhooks (Stripe, Adyen,
CloudPayments) the signature is proof of origin only: the re-fetch amount
MUST match the webhook amount, and a mismatch MUST produce no transition,
a P1 alert, and a manual-queue entry. X-Rocket — which documents no
signature — MUST always re-fetch, accepting finality only on
`payment.status = 'paid'` AND `payment.finalizedAt != null`.

**Evidence profile:** domain, documentation

**U6 implementation boundary:** U6 enforces the universal inline `getStatus`
re-fetch before a `paid` transition and returns 502 on any transient re-fetch
or persistence failure so provider redelivery resumes the durable receipt.
The audit hardens the normalized port boundary with protocol signature modes,
provider ownership, exact amount/currency comparisons, fetched X-Rocket finality,
and legal persistence edges. Provider-specific signature implementations and
status/finality mapping, P1/manual-queue escalation, and reconciler completion
remain U7-U9 work and MUST NOT be claimed by scaffold evidence.

**Invariants:**

- The double-check rule is universal: no provider's webhook body alone
  ever moves a payment to `paid`.
- Only the explicitly unsigned provider protocols may return `none` from
  signature verification. Invalid verification modes and blank idempotency
  keys fail before receipt claim. Resolved adapter identity and payment provider
  ownership must agree, and event hints cannot replace a stored provider reference.
- Paid transitions require exact valid amount/currency agreement with the
  persisted payment and any supplied webhook amounts. X-Rocket requires a valid
  provider-fetched finality timestamp. Provider re-fetch is evidence only;
  terminal or illegal state changes are refused by the shared state machine.
- U6 accepts exactly zero or one normalized event per delivery. A provider
  adapter that produces multiple events is rejected before receipt claim;
  receipt-wide batch finalization is not partially acknowledged.
- A re-fetch failure marks the claimed receipt `error`, answers 502, and
  permits exactly one later redelivery to renew the claim lease.
- Provider-specific re-fetch evidence eventually lands in the `paid`
  transition's `provider_evidence` when U7-U9 adapters expose it.

**Failure behavior:**

- Adapter-reported amount/finality contradictions make no transition and
  leave a retryable error receipt. U7-U9 add real adapter mappings and escalation.
- A re-fetch timeout or transient provider failure answers 502. It never sends
  200 for a non-durable or unresolved paid transition.

#### Scenario: A signed webhook claims paid but the API disagrees

- **WHEN** a Stripe webhook reports `payment_intent.succeeded` but the
  re-fetched provider status is not paid
- **THEN** no transition to `paid` occurs
- **AND** the receipt is finalized without changing the payment

#### Scenario: An unsigned X-Rocket webhook claims paid

- **WHEN** a X-Rocket `payment_status_changed` reports
  `payment.status = 'paid'`
- **THEN** the system re-fetches through the provider adapter
- **AND** U7's adapter MUST expose finality so only a finalized payment can map
  to the normalized paid status

#### Scenario: The re-fetch times out

- **WHEN** the inline re-fetch fails or exceeds its provider timeout
- **THEN** the receipt is marked `error` and the ingress answers 502
- **AND** a provider redelivery renews the claim lease and retries cleanly
