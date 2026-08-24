## Participants and Owners

- Product/domain owner: runtime maintainers
- Specification author: backend maintainers
- Independent verification reviewer: backend maintainers (distinct group from
  product, required for the high-risk requirements REQ-PAYMENT-ORDER-001,
  REQ-PAYMENT-PROVIDER-002, REQ-PAYMENT-WEBHOOK-002)
- Security reviewer: security maintainers (credential envelope, webhook
  signatures, redaction)
- Operations reviewer: platform operations (key rotation, RU gates,
  rollback runbooks)

## Sources (authority ladder, highest wins)

1. `xrocket-new-openapi.json` — "xRocket Pay API" v1.0.0, OpenAPI 3.0, saved
   2026-08-22 from `https://pay.api.xrocket.exchange/api/docs-json`. For the
   xRocket adapter it is the single source of truth; every older xRocket doc
   generation is superseded for endpoint/payload/auth/webhook/error facts.
2. `repo-conventions.md` — how a backend feature is built in this repository
   (one `@app/backend` package, fiat-currency as the reference capability,
   static-check and coverage gates).
3. `crypto-providers.md` / `fiat-providers.md` (research, 2026-08-20) — the
   other seven providers; their "verified" flags stand.

## Actors and Outcomes

- Customers create, query, cancel, and address payments through their
  session-authenticated backend; they never see provider internals.
- Operators onboard providers by writing a registry row (credentials
  envelope-encrypted at rest) and toggling `enabled` — no deploy.
- Support staff close edge cases through admin refund and manual-status,
  every mutation audit-logged with before/after and the provider's current
  status captured at call time.
- Verification owners see, per requirement, the exact projects, evidence
  files, and lanes that must pass.

## Rules

- One payment identity: our payment UUID is the `clientInvoiceId` /
  `order_id` / `Idempotence-Key` / `reference` sent to every provider.
- No provider webhook body alone ever moves a payment to `paid` — a
  provider-API re-verification precedes every paid transition; for signed
  fiat webhooks the re-fetch must match the webhook amount.
- Unknown provider statuses are in-progress (`processing`), never `paid` —
  the xRocket spec says it verbatim: statuses "may be extended in the
  future… handle unknown statuses gracefully" and "treat unknown statuses as
  'in progress'".
- Amounts are decimal strings on the wire and exact `@app/common-money`
  ratios in code; no binary float parsing anywhere in payments.
- The FX snapshot is written at creation and never modified; provider
  realized amounts land in the `paid` event evidence only.
- Receipt before action: every webhook inserts a
  `(provider_code, idempotency_key)` receipt row before any state change;
  the unique index is the replay wall.
- Enable/disable is data, not code: no deploy to switch providers.
- Fail closed: no eligible provider, credential failure, down health, or
  missing FX quote means 503 — never a guessed conversion or a half-routed
  payment.
- Underpaid never auto-`paid`; it stays `processing` with `partial_amount`
  and dies at expiry or by explicit admin decision.
- Credentials are DB-stored, envelope-encrypted per row (AES-256-GCM),
  rotatable via a prev-key pair + re-encrypt sweep, and returned to admins
  only as `{ keyId, last4, rotatedAt }`.

## Examples

- A xRocket `payment_status_changed` webhook with
  `payment.status = 'paid'` and `finalizedAt != null` re-fetches
  `GET /api/v1/invoice?invoiceId=…` and transitions to `paid` with the
  realized `receiveAmount` captured in the event evidence.
- A Stripe `payment_intent.succeeded` with a `Stripe-Signature` 6 minutes
  stale is rejected: tolerance is 5 minutes, and each retry delivery carries
  a fresh timestamp + signature, so expectations regenerate per delivery.
- A Heleket webhook is signed over
  `MD5(base64(JSON.stringify(data) with '/' escaped to '\/') + key)` — the
  slash-escape quirk is a documented real failure mode and gets a golden
  test against a captured staging sample.
- An Adyen notification is signed over the colon-joined payload
  `pspReference:originalReference:merchantAccountCode:merchantReference:value:currency:eventCode:success`
  with empty fields kept as empty strings, under a hex-decoded HMAC key.
- NOWPayments sends no IPN on expiry, so the reconciler polls
  `GET /v1/payment/{id}` to terminal for it — a deposit that arrives late
  must not be orphaned.

## Counterexamples and Boundaries

- A webhook redelivery after the transition applied gets 200 with zero side
  effects — nothing re-transitions (idempotent transition is a pure no-op).
- A late provider `paid` on a cancelled/expired/failed payment does NOT
  transition; it appends a `reconcile` event with reason
  `late_payment_after_close`, raises P1, and the operator refunds manually
  (double-spend / refund-owed guard).
- A disabled provider still accepts webhooks: disablement fail-closes new
  payments only; in-flight payments must settle.
- xRocket's spec documents no signature scheme (zero occurrences of
  "signature" or "secret"), so its webhooks verify as `none` and the
  double-check rule is mandatory for it — not an optimization.
- The mongodb axis ships but is not wired in this workspace; its
  ordered-write pattern (receipt → event → payment) is documented as the
  missing-transaction fallback.
- The generic REST fallback provider is documented, not built in v1.

## Failure and Operational Modes

- Boot fails closed when the credentials master key is missing, both
  `_KEY` and `_KEY_FILE` are set, or a provider row's `keyId` matches
  neither current nor prev key (the provider name is in the error).
- A provider `auth`-class error downs the provider immediately: fail closed
  now, P1, operator rotates.
- Receipt persistence failure answers 502 `webhook-processing-error` so the
  provider redelivers; nothing was committed.
- Provider unreachable at expiry: the payment keeps `processing` with a
  `stuck` flag (a late deposit must not be orphaned — double-charge risk)
  and escalates to manual after 30 minutes. We never auto-expire on our
  clock while a payment may be in flight.
- Webhooks and the reconciler are never blocked by health — that is how a
  downed provider recovers.

## Assumptions

- Provider credentials, base URLs, and webhook base URL are
  OPERATOR-CONFIGURED at deploy time; the repository never invents an
  endpoint, header, or scheme the sources do not define.
- The fiat-currency catalogue holds rate-history quotes for the pivot
  display; a missing quote fails creation with `payment-fx-unavailable`.
- Redis is available (bundled capability) for the reconciler redlock.
- NATS is available for outbox publication to notification consumers.

## Unresolved Questions

- xRocket base URL: the spec's `servers` array is empty — operator
  configured per row; the docs UI host is verified live but not pinned by
  the spec.
- Where the xRocket application-wide webhook URL is registered: xRocket app
  settings (OPERATOR-CONFIGURED, location not in spec); per-invoice
  `callback.callbackUrl` overrides it.
- Rate-limit numbers for xRocket, CryptoBot, Heleket, NOWPayments, Adyen:
  429 exists where documented but values are absent — client token buckets
  use conservative defaults.
- xRocket testnet: host lives in docs, not spec; the legacy
  `PUT /api/v1/invoices/pay` test trigger is absent from this spec and must
  be confirmed live on testnet before use.
- Adyen `GET /v72/payments/{pspReference}` as the reconciliation query:
  standard Checkout endpoint, verify at onboarding (flagged in research).
- xRocket refunds for paid invoices: not in the spec; capability
  `refund = false`, manual path only.
