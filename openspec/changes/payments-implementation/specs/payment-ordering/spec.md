## ADDED Requirements

### Requirement: [REQ-PAYMENT-ORDER-001] The payment lifecycle follows one state machine

The payment lifecycle SHALL consist of exactly the states `pending`,
`processing`, `paid`, `failed`, `cancelled`, `expired`, and `refunded`, of
which `paid`, `failed`, `cancelled`, `expired`, and `refunded` MUST be
terminal, and every status change — from webhook, reconciler, or admin
path — MUST pass through one pure transition function that enforces:
(1) every transition writes a `payment_events` row in the same transaction
as the status update (the mongodb axis: ordered write, event first);
(2) no provider webhook body alone moves a payment to `paid` — a
provider-API re-verification MUST precede the transition; (3) an unknown
provider status MUST be treated as in-progress (`processing`), never
`paid`; (4) amount fields move only from provider-confirmed values;
(5) an underpaid payment stays `processing` with the partial amount
recorded and is never auto-`paid`; (6) re-applying the same transition MUST
be a pure no-op; (7) `refunded` is reachable only from `paid` and
`refunded_amount` MUST NOT exceed `amount`; (8) a late provider `paid` on a
terminal-closed payment MUST NOT transition — a `reconcile` escalation
event with reason `late_payment_after_close` MUST be appended and a P1
alert raised; (9) the FX snapshot is written at creation and never
modified.

**Evidence profile:** domain, documentation

**Invariants:**

- The transition function is the single definition of legal edges; no
  other code path writes `payments.status` outside it.
- Terminal states accept no further transition, including `refunded`.
- Partial refunds keep the payment `paid` with `refunded_amount > 0` and
  append-only refund rows; only a confirmed full refund reaches
  `refunded`.
- Evidence for every transition lands in
  `payment_events.provider_evidence` (provider status, finality marker,
  realized amounts).

**Failure behavior:**

- An illegal edge is a no-op that returns the reason, not an error, so
  webhook redelivery, reconciler races, and retry storms never
  double-credit or double-log state.
- A provider reporting paid on a closed payment raises P1 and leaves the
  payment terminal; the operator refunds manually.

#### Scenario: A provider status nobody has mapped

- **WHEN** the reconciler or a webhook reports a provider status outside
  the known set for its provider
- **THEN** the payment moves to or stays `processing`
- **AND** it is never treated as `paid`

#### Scenario: The same paid event arrives twice

- **WHEN** a redelivered webhook reports `paid` on a payment already
  `paid`
- **THEN** the transition is a pure no-op with zero state change
- **AND** no second `state_change` event row is written

#### Scenario: The provider pays after we closed the payment

- **WHEN** the provider reports `paid` for a payment already
  `cancelled`, `expired`, or `failed`
- **THEN** no transition occurs
- **AND** a `reconcile` event with reason `late_payment_after_close` is
  appended and a P1 alert fires

#### Scenario: A full refund is confirmed

- **WHEN** the provider confirms a full refund for a `paid` payment
- **THEN** the payment reaches `refunded` with `refunded_amount` equal to
  `amount`

### Requirement: [REQ-PAYMENT-ORDER-002] Money is exact-ratio end to end and FX is snapshotted at creation

Every provider amount SHALL be a decimal string on the wire, converted to
`@app/common-money` exact ratios at exactly one shared boundary, and MUST
NOT be parsed through binary floats anywhere in payments code; cross-currency
addition MUST throw. A fiat-denominated payment SHALL record its FX snapshot
at creation from the latest fiat-currency rate-history quote with
`asOf` ≤ creation time, and a crypto payment's fiat-equivalent display SHALL
use the provider's own rate recorded with `source: 'provider:<code>'` and
`feeInclusive: true`. The snapshot MUST be immutable after creation, and
provider-realized net amounts MUST land only in the `paid` event evidence.

**Evidence profile:** domain, documentation

**Invariants:**

- Decimal text on the wire, exact integer-ratio arithmetic in code; a
  Stripe/Adyen minor-unit integer is converted by exact division by
  `10^minorUnitExponent`, never `Number`/`parseFloat`.
- The FX snapshot is locked in the same transaction that inserts the
  `payments` row and is never mutated (the realized amount is what settled;
  the snapshot is what the customer saw).
- Display FX uses fiat-currency USD-pivot rates for display only, never
  settlement math.

**Failure behavior:**

- Creation without a usable quote fails with `payment-fx-unavailable`
  (503); the operator must have seeded the currency in the
  fiat-currency catalogue.
- An amount that is not decimal text is rejected before it reaches
  storage.

#### Scenario: A fiat payment is created

- **WHEN** a fiat payment is created for a currency with a seeded rate
  history
- **THEN** its `fx_snapshot` records the latest quote with `asOf` ≤ the
  creation time and that quote's `source` provenance
- **AND** the snapshot is never modified afterwards

#### Scenario: Creation without a quote

- **WHEN** a fiat payment is created for a currency with no rate-history
  quote
- **THEN** creation fails with `payment-fx-unavailable` (503)

#### Scenario: A crypto invoice shows a fiat equivalent

- **WHEN** a crypto payment is priced and the provider returns its own
  rate
- **THEN** the snapshot records that rate with `feeInclusive: true`
- **AND** the provider's realized net amount is captured in the `paid`
  event evidence, not in the snapshot

### Requirement: [REQ-PAYMENT-ORDER-003] Creation is idempotent through one payment identity

The system SHALL use one payment identity as the idempotency anchor with
every provider: `clientInvoiceId` (X-Rocket), `order_id` (Heleket,
NOWPayments), `Idempotence-Key` (YooKassa), and `reference`
(Stripe/Adyen) MUST all equal the payment's UUID. A create request
reusing an `orderRef` for the same tenant SHALL return the existing
payment without creating a second provider invoice, and the persistence
axis MUST enforce this with a unique constraint; a provider duplicate
error (X-Rocket `client_id_already_taken`) MUST be resolved as "already
created" — fetch the invoice, do not error.

**Evidence profile:** domain, documentation

**Invariants:**

- Our payment UUID fits every provider's identifier bound (≤ 100 chars
  for X-Rocket, 1..128 for Heleket, ≤ 64 for YooKassa).
- The unique index `(provider_code, id)` (postgres `uq_payments_provider_client`,
  the mongo unique collection key) is the database-level replay wall for
  creation.
- `meta.orderRef` is unique per tenant and resolves to exactly one
  payment.

**Failure behavior:**

- A reused `orderRef` answers 409 at the API when no payment exists for
  it yet in flight; a create whose provider returns the already-taken
  client id resolves to the existing invoice rather than failing.

#### Scenario: The same order is submitted twice

- **WHEN** the same `orderRef` is submitted for the same tenant while the
  first create is still pending or after it completed
- **THEN** the same payment id is returned
- **AND** no second provider invoice is created

#### Scenario: The provider says the client id is already taken

- **WHEN** X-Rocket answers a create with `client_id_already_taken` for our
  own payment id
- **THEN** the system fetches the existing invoice and treats the create
  as already created

### Requirement: [REQ-PAYMENT-ORDER-004] Expiry and underpaid payments close deterministically

A payment whose provider reports expired, or whose reconciler determines
it is past `expires_at`, SHALL move to `expired` only with provider status
on its side; while the provider is unreachable at expiry the payment MUST
keep `processing` with a `stuck` flag and escalate to manual after 30
minutes. NOWPayments MUST be polled to terminal because it sends no IPN
on expiry. An underpaid payment (provider `partially_paid`, `wrong_amount`,
`X`) SHALL stay `processing` with `partial_amount` recorded and MUST NOT
auto-`paid`; at expiry it dies `expired` or an admin moves it to a
terminal state via `manual-status` with the provider's current status
captured.

**Evidence profile:** domain, documentation

**Invariants:**

- We never auto-expire on our own clock while a payment may be in flight —
  a late deposit must not be orphaned (double-charge risk).
- `partial_amount` is recorded on every underpaid report; the product
  rule is underpaid never auto-`paid`.
- `manual-status` writes the double-check record: the provider's current
  status at call time is captured in the audit entry.

**Failure behavior:**

- Provider unreachable past expiry: `stuck` flag + P2 alert, manual
  escalation event after 30 minutes; the payment is not closed.
- `manual-status` to `paid` without full provider evidence is refused —
  only `failed|cancelled|expired|refunded` from a non-terminal state, or
  `paid` with evidence attached.

#### Scenario: The provider says expired

- **WHEN** the provider reports an expired status for a non-terminal
  payment
- **THEN** the payment moves to `expired` with the provider status in the
  event evidence

#### Scenario: The provider is unreachable at expiry

- **WHEN** `expires_at` passes and the provider cannot be reached
- **THEN** the payment keeps `processing` with a `stuck` flag
- **AND** after 30 minutes a manual-escalation event is written

#### Scenario: A short deposit arrives

- **WHEN** the provider reports `partially_paid` (or the provider's
  equivalent underpaid status)
- **THEN** the payment stays `processing` with `partial_amount` recorded
- **AND** it is never auto-`paid`; at expiry it dies `expired` or is
  closed by explicit admin decision

## REMOVED Requirements

### Requirement: [REQ-PAYMENTS-SCAFFOLD-001] The payments scaffold compiles and resolves through its aliases

**Reason**: Retired by U1 of the payments change: the five projects now
carry the real ordering, provider, and webhook requirements, and no
scaffold-level requirement survives past U1.

**Migration**: The five scaffold suites keep running unchanged; their
`// @requirements` markers now cite the owning real requirement per
project, and the projects are owned by the requirements above (ordering
plus the provider and webhook capabilities).
