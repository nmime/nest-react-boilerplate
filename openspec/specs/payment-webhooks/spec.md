# Payment webhook specification

## Purpose

Keep webhook ingress safe under every provider retry regime:
signatures verified over the raw bytes before anything is parsed, a
receipt row before any state change, idempotent redelivery, and no
payment ever credited from a webhook body alone. Ingress is public and
provider-verified on every selected backend. The sidecar evidence is current
through U6 for raw ingress, replay, recovery, and persistence races; the
mock-provider full-stack journey remains planned for U9/U10.

## Requirements

### Requirement: [REQ-PAYMENT-WEBHOOK-001] Each provider's webhook is verified before it is trusted

Webhook ingress SHALL expose one public route per provider
(`POST /api/v1/webhooks/{x-rocket|cryptobot|heleket|nowpayments|yookassa|cloudpayments|stripe|adyen}`,
plus `GET /api/v1/webhooks/cloudpayments` for its GET-format IPN) with no
session or RBAC guard — the signature is the gate. A raw-body hook SHALL
stash the exact request bytes before any JSON parsing, and verification
MUST run over the raw body first, using each provider's documented
algorithm: `t=<unix_ts>,v1=<sig>` HMAC-SHA256 over
`"<t>.<raw body>"` with 5-minute tolerance and expectations regenerated
per retry delivery (Stripe); the colon-joined 8-field payload with empty
fields kept empty under a hex-decoded key (Adyen); recursively
sorted-parameters compact JSON under HMAC-SHA512 (NOWPayments);
slash-escaped serialized body under `MD5(base64(body) + key)` (Heleket);
HMAC-SHA256 over the raw body keyed by `sha256(token)` (CryptoBot);
dual HMAC headers (CloudPayments); no documented scheme → result `none`
(X-Rocket, YooKassa v3). An invalid signature MUST answer 400
`webhook-signature-invalid` before any receipt or other persistence call.

**Evidence profile:** domain, documentation

**Invariants:**

- Verification is constant-time comparison where a scheme exists; the
  signature is always computed over the raw bytes, never a re-serialized
  parse.
- Valid and unsigned verification outcomes are recorded as
  `signature_valid` ∈ `valid|none` on the durable receipt, and every
  delivery outcome is emitted through production OpenTelemetry metrics.
  Invalid signatures are metrics-only because they MUST create no receipt.
- Unknown provider keys answer 400 `webhook-signature-invalid`
  (unroutable).

**Failure behavior:**

- A valid-but-stale Stripe timestamp (beyond the 5-minute tolerance) is
  rejected as invalid, not accepted.
- A Heleket body whose re-serialization drifts from the documented
  convention fails verification — the golden sample pins the exact
  bytes.

#### Scenario: A forged Stripe webhook arrives

- **WHEN** a delivery's `Stripe-Signature` does not verify under the
  endpoint secret, or its timestamp is more than 5 minutes old
- **THEN** the ingress answers 400 `webhook-signature-invalid`
- **AND** no receipt, event, or payment row is written

#### Scenario: An X-Rocket callback arrives

- **WHEN** a X-Rocket webhook arrives with the documented
  `{ id, timestamp, type, data }` envelope
- **THEN** verification returns `none` (the spec documents no signature
  scheme) and processing continues under the double-check rule

#### Scenario: A Heleket webhook is replayed with tampered bytes

- **WHEN** a Heleket delivery's body no longer matches
  `MD5(base64(re-serialized body) + key)` under the documented
  slash-escape convention
- **THEN** verification fails and the ingress answers 400

### Requirement: [REQ-PAYMENT-WEBHOOK-002] Every webhook is receipted before it acts and replays safely

Each verified delivery SHALL atomically claim a `payment_webhook_receipts` row keyed by
`(provider_code, idempotency_key)` — storing `raw_body` exactly as
received, `signature_valid`, and processing status — before any state
change. A redelivery of an `applied` key MUST answer 200 with zero side
effects; a duplicate while the prior delivery is still in-flight (under
5 s) MUST answer 409 `webhook-replayed`; an event older than 24 h against
a terminal payment MUST answer 410 `webhook-stale`; and a receipt that
cannot be persisted MUST answer 502 `webhook-processing-error` so the
provider redelivers. A disabled provider MUST still accept its webhooks.

**Evidence profile:** domain, documentation

**Invariants:**

- The unique constraint on `(provider_code, idempotency_key)` is the
  replay wall on every persistence axis — dedupe is database-level, safe
  across replicas.
- A 200 response is sent only after the receipt and every required event
  and payment transition are durable. A stale or failed claim is recovered
  by one atomic owner; concurrent claimants observe the in-flight 409 wall.
- Idempotency keys are provider-specific composites (X-Rocket body `id`;
  CryptoBot `invoice_id:paid_at`; Heleket `uuid:status:txid`;
  NOWPayments `payment_id:payment_status:purchase_id`; YooKassa
  `event:object.id:status`; CloudPayments `TransactionId:Type:Status`;
  Stripe event id; Adyen `pspReference:eventCode`).
- Raw bodies are stored for admin debugging, admin-only and
  audit-logged; webhook responses never contain secrets.

**Failure behavior:**

- A provider retry after our 409 gets 200 once the first delivery
  applied — the rejection table exists so provider retry regimes
  (CryptoBot 17×/3d then auto-disable, YooKassa 7×/24h) always converge.
- A transient DB failure during claim, transition, or terminal receipt
  persistence answers 502; success is never acknowledged before durability.

#### Scenario: The same delivery arrives twice

- **WHEN** a provider redelivers a webhook whose key is already
  `applied`
- **THEN** the ingress answers 200 immediately with zero side effects
- **AND** no state re-transitions and no second receipt row exists

#### Scenario: Two identical deliveries race

- **WHEN** a duplicate delivery arrives while the first is still
  processing (under 5 s)
- **THEN** the ingress answers 409 `webhook-replayed`
- **AND** the provider's later retry finds the applied receipt and gets
  200

#### Scenario: A stale event hits a terminal payment

- **WHEN** an event older than 24 h arrives for a payment already in a
  terminal state
- **THEN** the ingress answers 410 `webhook-stale`
- **AND** the receipt is recorded `ignored`

#### Scenario: The receipt cannot be persisted

- **WHEN** the receipt insert fails because the database is unavailable
- **THEN** the ingress answers 502 `webhook-processing-error`
- **AND** nothing was committed, so the provider's redelivery retries
  cleanly

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
Provider-specific realized-amount comparison, X-Rocket `finalizedAt` mapping,
P1/manual-queue escalation, and reconciler completion remain U7-U9 work and
MUST NOT be claimed by U6 evidence.

**Invariants:**

- The double-check rule is universal: no provider's webhook body alone
  ever moves a payment to `paid`.
- U6 accepts exactly zero or one normalized event per delivery. A provider
  adapter that produces multiple events is rejected before receipt claim;
  receipt-wide batch finalization is not partially acknowledged.
- A re-fetch failure marks the claimed receipt `error`, answers 502, and
  permits exactly one later redelivery to renew the claim lease.
- Provider-specific re-fetch evidence eventually lands in the `paid`
  transition's `provider_evidence` when U7-U9 adapters expose it.

**Failure behavior:**

- U6 treats any adapter-reported amount/finality contradiction as not-paid and
  makes no transition; U7-U9 add explicit amount/finality fields and escalation.
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
