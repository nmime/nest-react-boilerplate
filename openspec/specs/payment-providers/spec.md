# Payment providers specification

## Purpose

Keep the eight provider adapters behind one port, the registry
routing and its fail-closed guarantees, the envelope-encrypted credential
lifecycle, the health evidence, and the reconciliation/outbox/expiry
machinery explicit — with nothing about an endpoint, header, or scheme
ever assumed. Adapters live in the main lib as files behind
`PaymentProviderPort`; the postgres axis is wired and the mongodb axis
ships as an inert reference. The sidecar evidence at this stage of the
change is scaffold-level and is re-pointed as U2–U9 land.

## Requirements

### Requirement: [REQ-PAYMENT-PROVIDER-001] The registry routes by priority, shadow, region, and health

The system SHALL maintain a `payment_providers` registry row per provider
(`code`, `kind`, `enabled`, `priority`, `tenant_id` shadow,
`supported_currencies`, non-secret `config`, `base_url`, contract
`version`, credentials, `region_allow`/`region_deny`) and SHALL route each
create to the enabled, credentialed, region-permitted, non-down provider
with the lowest `priority` within the kind, where a `(code, tenant)` row
shadows `(code, NULL)`. When no eligible provider exists, creation MUST
fail closed with `payment-provider-unavailable` (503). Enabling and
disabling SHALL be a data change requiring no deploy, and DELETE of a
provider row MUST be refused with 409 while non-terminal payments exist.

**Evidence profile:** domain, documentation

**Invariants:**

- Routing order: `enabled` → credentials configured (enforced by a CHECK
  constraint — an enabled row without credentials cannot exist) → tenant
  shadow → region (`region_deny ∋ tenantRegion` → out;
  `region_allow ≠ null ∧ ∌ tenantRegion` → out) → health ∉
  `{down, disabled}` → lowest `priority` first within kind.
- The registry is the kill switch: disablement fail-closes new payments
  only; in-flight payments keep settling via webhooks and the reconciler.
- The admin surface exposes provider CRUD, enable/disable, rotate,
  re-encrypt, and health-check, every mutation audit-logged.

**Failure behavior:**

- No eligible provider (disabled, missing, health down, region-denied)
  answers 503 `payment-provider-unavailable` — never a guessed provider.
- A row that is `enabled` without credentials is impossible at the
  database level.

#### Scenario: A tenant has a shadow row

- **WHEN** both `(code, NULL)` and `(code, tenant)` rows exist for the
  requested kind
- **THEN** the tenant's row is used for that tenant's payments

#### Scenario: Every eligible provider is down

- **WHEN** a create request arrives and no enabled, credentialed,
  region-permitted, non-down provider matches
- **THEN** the create fails with 503 `payment-provider-unavailable`

#### Scenario: An operator disables a provider

- **WHEN** an admin disables a provider row
- **THEN** new payments fail closed for that provider without any deploy
- **AND** in-flight payments for it keep settling

### Requirement: [REQ-PAYMENT-PROVIDER-002] Provider credentials are envelope-encrypted, rotatable, and redacted

Provider credentials SHALL be stored in the database envelope-encrypted
per row as `{ keyId, iv, ct, tag }` with AES-256-GCM under a 32-byte
master key supplied by `PAYMENTS_PROVIDER_CREDENTIALS_KEY` or
`PAYMENTS_PROVIDER_CREDENTIALS_KEY_FILE` — exactly one, validated at boot,
fail-closed. Rotation SHALL use a prev-key pair
(`PAYMENTS_PROVIDER_CREDENTIALS_PREV_KEY` / `_PREV_KEY_ID`) and an admin
re-encrypt sweep over prev-key rows; a row whose `keyId` matches neither
key MUST fail boot closed with the provider name in the error. The admin
API SHALL return credentials only as `{ keyId, last4, rotatedAt }`, and
adapters MUST NOT log request bodies or headers.

**Evidence profile:** domain, documentation

**Invariants:**

- The master key lives only in env/file, never in the database; each row
  carries its own nonce (per-row envelope encryption).
- A row is never boot-time-decrypted lazily: key mismatch fails the whole
  boot, not the first request.
- Admin responses are built from explicit field lists — no row spread —
  so credential material can never leak into a serialized response.
- Every credential touch (store, rotate, re-encrypt) writes an
  audit-log entry with before/after, credentials redacted.

**Failure behavior:**

- Both key env vars set, neither set, or an undecodable key: boot fails
  closed with an actionable error.
- A row with an unknown `keyId`: boot fails closed naming the provider.
- A response or log line containing credential material fails the
  redaction assertion.

#### Scenario: A rotation sweep runs

- **WHEN** the operator sets a new current key and the old key as prev
  and runs the admin re-encrypt
- **THEN** every prev-key row is decrypted with the old key and
  re-encrypted under the current key
- **AND** when zero prev-key rows remain, the prev env vars are cleared

#### Scenario: A row matches neither key

- **WHEN** the boot finds a provider row whose `keyId` matches neither the
  current nor the prev key
- **THEN** boot fails closed with the provider name in the error
- **AND** no half-able-to-decrypt process ever starts

#### Scenario: An admin reads the provider list

- **WHEN** the admin GETs the provider list
- **THEN** each row's credentials appear only as `{ keyId, last4,
rotatedAt }`
- **AND** no response field contains encrypted or plaintext credential
  material

### Requirement: [REQ-PAYMENT-PROVIDER-003] Every adapter obeys one port contract and its provider matrix

Each provider adapter SHALL implement the shared `PaymentProviderPort`
(`createPayment`, `getStatus`, `verifyWebhook`, plus optional
`refund`, `closePayment`, `resolvePaymentAddress`) and MUST use only the
provider's documented endpoints, auth scheme, and signature algorithm —
nothing assumed: bearer JWT (xRocket), `Crypto-Pay-API-Token` with
HMAC-SHA256 keyed by `sha256(token)` (CryptoBot),
`MD5(base64(json) + key)` with the documented slash-escape serialization
(Heleket), `x-api-key` with sorted-JSON HMAC-SHA512 (NOWPayments), no
signature with re-fetch (YooKassa v3), dual HMAC headers (CloudPayments),
`Stripe-Signature` with 5-minute tolerance and a fresh signature per retry
(Stripe), and the colon-payload HMAC with hex-decoded key (Adyen v72).
All adapter HTTP SHALL go through the shared wrapper that classifies
errors as `auth|client|server|rate_limited|timeout|network` with the
documented retry/backoff/token-bucket semantics, and an unknown provider
status MUST normalize to `processing`.

**Evidence profile:** domain, documentation

**Invariants:**

- The port is the only interface services see; the eight adapters are
  code behind it, injected through
  `PaymentProvidersInjectToken = Symbol('PaymentProvidersInjectToken')`.
- Provider amounts cross the wire as decimal strings (minor-unit
  integers for Stripe/Adyen converted exactly at the port boundary).
- An unknown provider `type`/status maps to the `server` class
  (retryable) or `processing` (status) — never a silent success.
- Adapters log at most URL + status class + provider code; never headers
  or bodies.

**Failure behavior:**

- `auth` class: the provider health goes `down` immediately, fail-closed,
  P1 — a rotated token must not silently break payments.
- `rate_limited`: exponential backoff per the row's `retry_policy`, then
  503 `payment-provider-rate-limited` with `retryAfterSeconds`.
- `client` class: mapped problem, no retry.

#### Scenario: An unknown status comes back

- **WHEN** `getStatus` returns a status string outside the provider's
  documented set
- **THEN** it normalizes to `processing`
- **AND** the raw string is recorded for audit

#### Scenario: The provider 429s

- **WHEN** the provider answers 429 within the retry budget
- **THEN** the call backs off per the row's `retry_policy`
- **AND** if the budget exhausts, the create fails with 503
  `payment-provider-rate-limited`

#### Scenario: Credentials are revoked

- **WHEN** an adapter call answers with an `auth`-class error
- **THEN** the provider health becomes `down` immediately and a P1 fires
- **AND** new creates fail closed with 503

### Requirement: [REQ-PAYMENT-PROVIDER-004] Provider health degrades and downs on evidence

The system SHALL track per-provider health
(`unknown|up|degraded|down|disabled`) with consecutive-error counters
updated on every adapter call: success resets the counters and sets
`up`; an `auth`-class error MUST down the provider immediately; `down`
also applies at ≥ 5 consecutive errors within 10 minutes; `degraded`
applies at ≥ 2 consecutive `server`/`timeout` errors. A `down` or
`disabled` provider MUST be excluded from new-payment routing (503
fail-closed); a `degraded` provider MUST remain eligible with extended
timeout and backoff; webhooks and the reconciler MUST NEVER be blocked by
health.

**Evidence profile:** domain, documentation

**Invariants:**

- Health is data on `payment_provider_health`, updated by the shared
  adapter wrapper, not by the adapters themselves.
- `disabled` is the admin toggle (`enabled = false`) and sets the health
  row to `disabled`.
- The admin health-check endpoint forces a live probe (`/health` or the
  provider's liveness equivalent + one `getStatus` on a sample payment)
  and records the result.

**Failure behavior:**

- A downed provider's in-flight payments keep settling: its webhook
  arrives, the poll confirms, the transition happens — health never
  blocks recovery.
- A degraded provider raises a P2 alert but keeps serving.

#### Scenario: Two server errors in a row

- **WHEN** the adapter wrapper sees two consecutive `server`/`timeout`
  errors for a provider
- **THEN** its health is `degraded` and it remains eligible for routing

#### Scenario: Five consecutive errors

- **WHEN** a provider accumulates five consecutive errors within ten
  minutes
- **THEN** its health is `down` and new payments exclude it with 503
  fail-closed

#### Scenario: The provider recovers

- **WHEN** a `down` provider answers a webhook or a reconciler poll
  successfully
- **THEN** the counters reset and the health returns toward `up`
- **AND** its in-flight payments can reach terminal states

### Requirement: [REQ-PAYMENT-PROVIDER-005] Reconciliation, outbox, and expiry run from persisted state

The reconciler SHALL tick (default 60 s, gated by a Redis redlock so
exactly one instance works per tick, batch 200) selecting non-terminal
payments whose last event is older than 60 s or that are past
`expires_at`, re-verify each via the adapter `getStatus`, and apply
transitions with actor `reconciler` and the provider status as evidence.
The outbox SHALL publish `state_change` events to terminal `paid` /
`refunded` to NATS at-least-once — the worker selects unpublished rows
with `FOR UPDATE SKIP LOCKED` (postgres) and marks them published on the
row — and the mongodb axis MUST use the documented ordered-write pattern
(receipt → event → payment) in place of transactions.

**Evidence profile:** domain, documentation

**Invariants:**

- Webhooks are advisory for every provider: the reconciler backstops all
  of them, and NOWPayments is polled to terminal because it sends no
  expiry IPN.
- Outbox publication is at-least-once; consumers MUST be idempotent.
- Provider-specific polling notes are honored: xRocket every tick
  (unsigned webhooks), cryptobot `getMe` liveness every 5 minutes with a
  24 h silence alert, YooKassa/CP/Stripe/Adyen only stuck rows.

**Failure behavior:**

- A tick that cannot reach a provider leaves the payment as-is with the
  stale flag; the next tick retries.
- A duplicate outbox publication is a consumer no-op, never a duplicate
  notification.

#### Scenario: A webhook was lost

- **WHEN** a provider's webhook for a paid invoice never arrives and the
  payment's last event is older than 60 s
- **THEN** the reconciler polls `getStatus`, sees the final state, and
  applies the transition with actor `reconciler`

#### Scenario: A paid event is published

- **WHEN** a payment transitions to `paid` and the outbox worker runs
- **THEN** the `state_change` event is published to NATS and
  `outbox_published_at` is set on the same row
- **AND** a redelivery publishes nothing new to state
