## MODIFIED Requirements

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
- Webhook persistence rechecks legal edges and provider ownership against the
  locked PostgreSQL row or version-guarded MongoDB snapshot. A concurrent close
  cannot be reopened by a previously fetched webhook status.
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
- Until U9 customer orchestration supplies tenant ownership, positive exact
  amounts, provider selection, and registered permissions, the legacy customer
  list/create scaffold returns 503 `payment-customer-unavailable` without reading
  or writing payment records. HTTP authentication and authorization still run
  first: anonymous callers receive 401 and callers without the unregistered
  payment grants receive 403. The service never exposes the unscoped persistence facade.

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
