## ADDED Requirements

### Requirement: [REQ-PAYMENT-WEBHOOK-001] Each provider's webhook is verified before it is trusted

Webhook ingress SHALL expose one public route per provider
(`POST /api/v1/webhooks/{xrocket|cryptobot|heleket|nowpayments|yookassa|cloudpayments|stripe|adyen}`,
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
(xRocket, YooKassa v3). An invalid signature MUST answer 400
`webhook-signature-invalid` with a best-effort receipt row
(`signature_valid='invalid'`) and a P1 alert.

**Evidence profile:** domain, documentation

**Invariants:**

- Verification is constant-time comparison where a scheme exists; the
  signature is always computed over the raw bytes, never a re-serialized
  parse.
- Every verification outcome is recorded: `signature_valid` ∈
  `valid|invalid|none` on the receipt, and the metric
  `webhooks.received{provider,signature}`.
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
- **AND** a receipt row with `signature_valid='invalid'` is recorded and
  a P1 alert fires

#### Scenario: An xRocket callback arrives

- **WHEN** a xRocket webhook arrives with the documented
  `{ id, timestamp, type, data }` envelope
- **THEN** verification returns `none` (the spec documents no signature
  scheme) and processing continues under the double-check rule

#### Scenario: A Heleket webhook is replayed with tampered bytes

- **WHEN** a Heleket delivery's body no longer matches
  `MD5(base64(re-serialized body) + key)` under the documented
  slash-escape convention
- **THEN** verification fails and the ingress answers 400

### Requirement: [REQ-PAYMENT-WEBHOOK-002] Every webhook is receipted before it acts and replays safely

Each delivery SHALL insert a `payment_webhook_receipts` row keyed by
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
- The response is sent right after the receipt commits (target < 200 ms);
  a provider re-fetch over its 3 s budget leaves the receipt `pending`
  for the reconciler, and the provider's retry still gets 200.
- Idempotency keys are provider-specific composites (xRocket body `id`;
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
- A DB failure during receipt insert commits nothing and answers 502.

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
a P1 alert, and a manual-queue entry. xRocket — which documents no
signature — MUST always re-fetch, accepting finality only on
`payment.status = 'paid'` AND `payment.finalizedAt != null`.

**Evidence profile:** domain, documentation

**Invariants:**

- The double-check rule is universal: no provider's webhook body alone
  ever moves a payment to `paid`.
- The re-fetch runs inline with a 3 s budget; over budget, the receipt
  stays `pending` and the reconciler completes the transition (the
  provider's retry still gets 200 via the applied-receipt path).
- The re-fetch evidence (provider status, finality marker, realized
  amount) lands in the `paid` transition's `provider_evidence`.

**Failure behavior:**

- Amount mismatch between a signed webhook and its re-fetch: no
  transition, P1, manual queue — the payment stays where it was.
- A re-fetch that contradicts the webhook (provider no longer reports
  paid) defers the transition to the reconciler's next evidence.

#### Scenario: A signed webhook claims paid but the API disagrees

- **WHEN** a Stripe webhook reports `payment_intent.succeeded` for an
  amount the re-fetched PaymentIntent does not carry
- **THEN** no transition to `paid` occurs
- **AND** a P1 alert fires and the payment goes to the manual queue

#### Scenario: An unsigned xRocket webhook claims paid

- **WHEN** a xRocket `payment_status_changed` reports
  `payment.status = 'paid'`
- **THEN** the system re-fetches the invoice and its payments
- **AND** the transition applies only if the re-fetch shows `paid` with
  `finalizedAt != null`

#### Scenario: The re-fetch times out

- **WHEN** the inline re-fetch exceeds its 3 s budget
- **THEN** the receipt stays `pending` and the 200 is still sent
- **AND** the reconciler completes the transition from the next poll
