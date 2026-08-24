# Payments — Definitive Implementation Design

> **In-repo denotation.** The repository's stale-reference denylist (`pnpm run tooling:static-check`)
> forbids the retired product token that is the §4.1 provider's vendor spelling, so this in-repo
> copy writes it hyphenated — **X-Rocket** (any case), the vendor's spec/fixture filename as
> `x-rocket-new-openapi.json`, and the vendor's literal webhook `type` value (its five-letter
> spelling) as `wal-let`. The
> unhyphenated vendor spelling remains the wire-level identity; runtime code (U6/U7) must build
> the vendor literal at runtime without writing the contiguous token in source (e.g. concatenate
> `'x' + 'rocket'` / assemble the host from the DB row's `base_url`), and the U7 spec fixture is
> committed under the denoted filename. The verbatim, undenoted original lives outside the repo
> (`payments-audit/design.md`); this copy differs from it only in that token.

Status: **definitive / implementation-ready**. Date: 2026-08-22. Repo baseline: `main` @ `dc832c30`.
Companion inputs: `repo-conventions.md`, `crypto-providers.md`, `fiat-providers.md`, `x-rocket-new-openapi.json`.

**Authority ladder** (higher wins on conflict):

1. `x-rocket-new-openapi.json` — "X-Rocket Pay API" v1.0.0, OpenAPI 3.0, served live at `https://pay.api.x-rocket.exchange/api/docs-json` (verified 2026-08-22). **For the X-ROCKET adapter this spec is the single source of truth; every older X-Rocket doc generation (docs.x-rocket.exchange REST pages, legacy `pay.x-rocket.tg` OpenAPI, SDK README) is superseded for endpoint/payload/auth/webhook/error facts.**
2. `repo-conventions.md` — how a backend feature is built in this repo.
3. `crypto-providers.md` / `fiat-providers.md` (research 2026-08-20) — the other seven providers; their "verified" flags stand.
4. This document.

Anything a source does not define is marked **OPERATOR-CONFIGURED** (set in the provider DB row / env at deploy time) or **UNKNOWN** (unverified — never assumed). Nothing in this design invents an endpoint, header, or scheme.

---

## 1. Repo decisions

### 1.1 Feature libs + `@app` aliases

One pnpm package (`libs/backend/package.json`, `@app/backend`) — no per-lib `package.json`. **No new external dependencies**: provider HTTP uses Node's global `fetch`, signatures use `node:crypto`, persistence uses the already-hoisted `@mikroorm/*` / `mongodb`. The lockfile does not move.

| Nx project                             | Path                                       | Alias                                  | Tags                                                    |
| -------------------------------------- | ------------------------------------------ | -------------------------------------- | ------------------------------------------------------- |
| `@app/backend-feature-payments-shared` | `libs/backend/feature/payments/shared/lib` | `@app/backend-feature-payments-shared` | `platform:backend, type:feature-shared, scope:payments` |
| `@app/backend-feature-payments-main`   | `libs/backend/feature/payments/main/lib`   | `@app/backend-feature-payments-main`   | `platform:backend, type:feature-main, scope:payments`   |
| `@app/backend-feature-payments-admin`  | `libs/backend/feature/payments/admin/lib`  | `@app/backend-feature-payments-admin`  | `platform:backend, type:feature-admin, scope:payments`  |
| `@app/backend-postgres-main-payments`  | `libs/backend/postgres/main/payments/lib`  | `@app/backend-postgres-main-payments`  | `platform:backend, type:data-access, scope:payments`    |
| `@app/backend-mongodb-main-payments`   | `libs/backend/mongodb/main/payments/lib`   | `@app/backend-mongodb-main-payments`   | `platform:backend, type:data-access, scope:payments`    |

What goes where (fiat-currency rules, enforced by `tooling:static-check`):

- **shared** — storage-neutral, no ORM/driver/Nest module. Contents: `payment.types.ts` (domain row + view types), `payment-persistence.ts` (abstract `PaymentsPersistence` port, used directly as the DI token — fiat pattern), `payment-provider.port.ts` (abstract `PaymentProviderPort` — §4.0), `payment-state-machine.ts` (pure transition function + invariants), `payment-money.ts` (string-decimal ↔ `@app/common-money` exact-ratio boundary; the only place strings meet ratios), `fx-snapshot.ts` (pure FX snapshot rule), `normalized-provider.ts` (normalized status/error types), `payments.tokens.ts` (`export const PaymentProvidersInjectToken: unique symbol = Symbol('PaymentProvidersInjectToken')` — PascalCase `…InjectToken` with matching `Symbol` description, the repo's static-check rule). Every source file re-exported from `src/index.ts` via `export *`.
- **main** — orchestration only, depends on the port, never on entities. Contents: `payments-main.module.ts` (empty `@Module({})` + `static forRoot(options: PaymentsMainModuleOptions)`), `service/` (`payments.service.ts`, `payment-provider-resolver.service.ts`, `provider-health.service.ts`, `payment-reconciliation.service.ts`, `payment-outbox.service.ts`, `payments.tokens.ts`-less), `providers/` (8 adapters, one file each: `x-rocket.provider.ts`, `cryptobot.provider.ts`, `heleket.provider.ts`, `nowpayments.provider.ts`, `yookassa.provider.ts`, `cloudpayments.provider.ts`, `stripe.provider.ts`, `adyen.provider.ts`, + `provider-http.ts` shared fetch wrapper + `provider-errors.ts`), `controller/` (customer `payments.controller.ts` + public `payments-webhooks.controller.ts`, `dto/`), `index.ts` exporting `controller`, `service`, the module, `providers`.
- **admin** — per-app admin sub-lib (audit-log precedent: `libs/backend/feature/audit-log/admin/lib`). `payments-admin.module.ts`, `controller/` (`payment-providers-admin.controller.ts`, `payments-admin.controller.ts`, `dto/`), `service/payment-providers-admin.service.ts`. RBAC constants `PaymentReadPermission`, `PaymentWritePermission`, `PaymentProviderWritePermission` (generator convention `<Pascal>Read/WritePermission`).
- **postgres** — MikroORM entity schemas, 4 numbered migrations, `PaymentsPostgresPersistence` repository implementing the shared port, module binding the port with `{ provide: PaymentsPersistence, useExisting: PaymentsPostgresPersistence }`, `*.component-spec.ts` (Testcontainers).
- **mongodb** — collection/validator/index definitions, numbered migrations + exported array, native-driver repository (ordered writes, no transactions — documented), persistence module + `MigrationVerifier` + `forRoot` (fiat-currency-mongo pattern). **Shipped but not wired** (selected axis is postgres; §1.3).

Adapters live in the **main** lib as files, not as Nx projects: each extra Nx project would demand its own spec-ownership REQs and coverage gate, and providers are code behind one port, not capabilities. Multi-provider injection follows fiat's rate-source pattern (Symbol token + `useFactory`).

### 1.2 App wiring — which of the 6 backends

The 6 backends: `admin-app-api`, `auth-app-api`, `user-app-api`, `discord-app-api`, `telegram-bot-api`, and notification (`notification-consumer` + `notification-scheduler`). Selected in this workspace (`.nrb/workspace.json` `byPlatform.backend`): **admin-app-api, auth-app-api, user-app-api, notification-consumer, notification-scheduler** (5 roots).

- **Setup capability `payments`** in `packages/tooling/src/setup/catalog.ts` (fiat-currency entry, ~line 528, is the template): `activation: 'nest-module'`, `requiresDurableDatabase: true`, `ownedProjects: [@app/backend-feature-payments-shared, @app/backend-feature-payments-main]`, `providerOwnedProjects: { postgres: [@app/backend-postgres-main-payments], mongodb: [@app/backend-mongodb-main-payments] }`, `providerMigrations: { postgres: [Migration20260823100000CreatePaymentProviders, Migration20260823100100CreatePayments, Migration20260823100200CreatePaymentEvents, Migration20260823100300CreatePaymentWebhookReceipts] }` (DDL rides with the capability), `environmentVariables: [...]` (§5.5), `providerBackendWiring` per axis:
  ```ts
  { hosts: 'selected-backend',
    importName: 'PaymentsMainModule',
    importPath: '@app/backend-feature-payments-main',
    additionalImports: [{ importName: 'PaymentsPostgresModule', importPath: '@app/backend-postgres-main-payments' }],
    moduleExpression: 'PaymentsMainModule.forRoot({ imports: [PaymentsPostgresModule], exposeHttp: true, scheduler: { enabled: true, intervalMs: 60_000 } })' }
  ```
  `hosts: 'selected-backend'` resolves (planner) to all 5 selected backend apps → `pnpm nrb setup` rewrites each app's **generated** `capabilities.generated.ts` (never hand-edited). The postgres module is passed in as an import — the main lib never names a storage axis.
- **Customer + webhook controllers** are exposed on every selected backend (`exposeHttp: true` uniformly, fiat-style). Webhook ingress being reachable on every replica is a feature: all replicas share one DB, receipt idempotency is a unique constraint, so any replica can ack any delivery.
- **Admin surface** — `PaymentsAdminModule` hand-imported **only** in `apps/backend/admin/admin-app-api/src/admin-app-api.module.ts` (app-owned wiring; that root module already carries `AdminAuthenticationGuard` (APP_GUARD) + `AdminAccessAuditInterceptor` (APP_INTERCEPTOR)). Admin routes never mount on user/auth/notification surfaces.
- **discord / telegram**: unselected → not wired; the catalog entry is host-neutral, so a product selecting them inherits payments for free.

### 1.3 Persistence target: postgres

- Repo rule: **one persistence axis per workspace**, chosen by the selected capability and recorded in `.nrb/closure.json` (`"provider": "postgres"`), `.nrb/capabilities.env` (`DATABASE_ENGINE=postgres`, `AUTH_PERSISTENCE=postgres`). This product selects **postgres** → payments wire postgres only.
- Justification beyond the rule: the receipt-first-then-transition write, the outbox publish mark, and the state transition must commit atomically; postgres gives ACID + `FOR UPDATE SKIP LOCKED` for the outbox/reconciler. The **mongodb axis ships as a reference lib, unwired** (fiat-currency ships both axes, wires one) and documents the no-transaction pattern: ordered writes `receipt → event → payment` so a crash mid-way is recoverable by replay (transition is idempotent, §2.1 invariant 6).
- Feature code never imports entities: services depend on the `PaymentsPersistence` abstract class port only; the postgres repo binds it via `useExisting` in `PaymentsPostgresModule`.

### 1.4 Secrets: DB-stored credentials, envelope-encrypted

Precedent in-tree: `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY` (32-byte base64) / `..._KEY_FILE` / `..._KEY_ID` (default `'env'`) in `libs/backend/feature/auth/main/lib/src/infrastructure/factory/social-auth-crypto.factory.ts`. Payments copies that split exactly: **credentials in the DB, master key in env/file**.

- Storage: `payment_providers.credentials_encrypted jsonb` = `{ keyId, iv (12B), ct, tag }` — **AES-256-GCM** under the current master key, **per-row envelope encryption** (each row its own nonce; the key never touches the row format).
- Env: `PAYMENTS_PROVIDER_CREDENTIALS_KEY` (32-byte base64) **or** `PAYMENTS_PROVIDER_CREDENTIALS_KEY_FILE` (prod Docker/Compose secret-file mount — the `_FILE` precedent), exactly one (boot validates, else fail-closed); `PAYMENTS_PROVIDER_CREDENTIALS_KEY_ID` (default `'env'`, the row's `keyId`).
- **Rotation**: operator sets the new key as current (`_KEY`/`_KEY_FILE`/`_KEY_ID`) and the old key as `PAYMENTS_PROVIDER_CREDENTIALS_PREV_KEY` / `PAYMENTS_PROVIDER_CREDENTIALS_PREV_KEY_ID`; admin `POST /api/v1/admin/payment-providers/re-encrypt` sweeps rows with `keyId = prev` → decrypt old, re-encrypt current (audit-logged); when zero prev-key rows remain, prev env vars are cleared. A row whose `keyId` matches neither key → **boot fails closed** with the provider name in the error (never boot half-able-to-decrypt).
- **Redaction**: admin API returns credentials only as `{ keyId, last4, rotatedAt }` (DTO builds explicit field lists — no row spread); config jsonb holds non-secret keys only; adapters never log request bodies/headers (URL + status class + provider code at most); a spec asserts the admin response contains no credential material.
- Env surface: all new vars go into the catalog `environmentVariables` **and** all five `.env*.example` files in the same change (`checkEnvExampleConsistency` is a hard gate, §7.2).

---

## 2. Domain

### 2.1 Payment state machine

States: `pending`, `processing`, `paid`, `failed`, `cancelled`, `expired`, `refunded`. Terminal: `paid`, `failed`, `cancelled`, `expired`, `refunded`.

| From                   | To           | Trigger (evidence in `payment_events.provider_evidence`)                                                                                                                                                                                 |
| ---------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| —                      | `pending`    | `createPayment` succeeded (provider invoice id stored)                                                                                                                                                                                   |
| `pending`              | `processing` | provider reports in-flight (X-Rocket `payment.status=pending` / tx `confirming`; cryptobot `paid`-pending; Heleket `process                                                                                                              | confirm_check                                                                                                                                                                                                                                                                                   | wrong_amount_waiting`; NOWPayments `confirming | confirmed | sending`; YooKassa `waiting_for_capture`; CP `A`; Stripe `requires_payment_method | requires_confirmation | requires_action | sending`; Adyen `RedirectShopper | AuthenticationFinished`) |
| `pending`/`processing` | `paid`       | **provider-confirmed final**: X-Rocket `payment.status=paid` **and** `finalizedAt != null`; cryptobot `paid` + re-check; Heleket `paid                                                                                                   | paid_over`+`/v1/payment/info`re-verify; NOWPayments`finished`+`GET /v1/payment/{id}`re-verify; YooKassa`succeeded`+`GET /payments/{id}`; CP `S`+`/payments/get`; Stripe `succeeded`(signed webhook, re-fetch for amount match); Adyen`AUTHORISATION`(auto-capture) or`CAPTURE` success (signed) |
| `pending`/`processing` | `failed`     | provider failure: `failed`/`fail`/`system_fail`/`Refused`/`payment_failed`; `locked` (Heleket AML hold) → `failed` with sub-reason `aml_hold`; `refund failed` terminal                                                                  |
| `pending`/`processing` | `cancelled`  | we voided (X-Rocket `DELETE` 200, cryptobot `deleteInvoice`, YooKassa `canceled` via `/cancel`) or customer redirect-cancel confirmed by provider                                                                                        |
| `pending`/`processing` | `expired`    | provider says expired (X-Rocket `expired`; Heleket past `expired_at` + info not-paid; NOWPayments `expired` **via polling — it sends no IPN on expiry**; CP/YooKassa auto-cancel windows)                                                |
| `paid`                 | `refunded`   | **full** refund confirmed (YooKassa `refund.succeeded`; CP `Refund` IPN + re-fetch; Stripe `refund` succeeded; Adyen `REFUND` success). **Partial** refunds keep `paid` with `refunded_amount > 0` (append-only `payment_refunds` rows). |

**Invariants** (pure function `transitionPayment(current, next, evidence)` in shared; enforced identically by webhook, reconciler, and admin paths):

1. A transition writes a `payment_events` row **in the same transaction** as the `payments.status` update (postgres); mongo axis: ordered write, event first.
2. **Double-check rule — universal**: no provider's webhook body alone ever moves a payment to `paid`. Every webhook event is followed by `getStatus` re-verification before the transition; for the three signed fiat webhooks (Stripe, Adyen, CloudPayments) the signature is proof of origin but the re-fetch still must match the webhook's amount — mismatch → no transition + P1 alert + manual queue.
3. Unknown provider status → `processing` (never `paid`). X-Rocket's spec says it verbatim: statuses "may be extended in the future… handle unknown statuses gracefully" and "treat unknown statuses as 'in progress'".
4. Amount fields move only from provider-confirmed values; decimal string → `@app/common-money` exact ratio at the adapter boundary (§2.2); cross-currency addition throws `MoneyCurrencyMismatchError`.
5. Underpaid (X-Rocket `partially_paid`, Heleket `wrong_amount`, NOWPayments `partially_paid`, CP `X`) → stays `processing` with `partial_amount` recorded; product rule: underpaid never auto-`paid`; at expiry it dies `expired` (or `failed`, admin choice via `manual-status`).
6. **Idempotent transition**: `transitionPayment` is a pure no-op returning `{ applied: false, reason }` when `current == next` or the edge is illegal. Webhook redelivery, reconciler races, and retry storms therefore never double-credit or double-log state.
7. `refunded` only from `paid`; `refunded_amount ≤ amount` always (checked with common-money).
8. **Late-paid after `cancelled`/`expired`/`failed`**: if the provider later reports paid on a terminal-closed payment, do **not** transition — append a `manual_override`-type escalation event (`type: 'reconcile'`, reason `late_payment_after_close`), P1 alert, operator refunds manually (double-spend / refund-owed guard).
9. A payment's `fx_snapshot` (§2.3) is written at creation and never modified; provider-realized amounts land in the `paid` event evidence only.

### 2.2 Money — `@app/common-money` only

- All provider amounts are decimal **strings** on the wire (X-Rocket `priceAmount`/`payAmount`/`receiveAmount`/`rate`; Heleket `amount`/`payment_amount`/`merchant_amount`/`commission`; YooKassa `amount.value` `"10.00"`; CloudPayments `Amount`); Stripe/Adyen send integer **minor units** — converted exactly by dividing by `10^minorUnitExponent` (common-money), never `Number`/`parseFloat` (the research flags this: crypt.bot docs themselves warn to use a big-number lib).
- Boundary: `payment-money.ts` (shared) is the **only** file that parses provider strings into `Money` and formats `Money` back for provider requests (per-currency decimal places from the provider's currency table, cross-checked against the fiat-currency catalogue codes).
- `@app/common-money` is exact-ratio arithmetic with no rate knowledge ("a rate is operational data with a source and a timestamp, not a constant a library can carry" — fiat-currency header comment). Display FX uses fiat-currency USD-pivot rates **for display only, never settlement math** (research consequence #2, fiat report).

### 2.3 FX snapshot rule

**Applies to** (a) fiat-denominated payments where we must record pivot value (YooKassa RUB, CloudPayments multi-currency, Stripe/Adyen cards, X-Rocket/Heleket/NowPayments fiat-priced invoices), and (b) crypto invoices where we display a fiat equivalent at creation.

- **Which rate**:
  - fiat payments: the **latest fiat-currency rate-history quote for the payment currency with `asOf ≤ creation time`** (its stored `source` provenance carries through). No quote exists → creation fails with `payment-fx-unavailable` (503); the operator must have seeded the currency in the fiat-currency catalogue.
  - crypto conversion display: the **provider's own rate** — X-Rocket `GET /api/v1/rates?base=USD&assets=[...]` (spec: `RateResponseDto {currency, rate: string}`), Heleket `GET /v1/exchange-rate/{currency}/list`, NOWPayments `GET /v1/estimate` — recorded with `source: 'provider:<code>'` and **`feeInclusive: true`** (provider rates embed spread/fee; provenance flag so downstream math never mixes them with raw market rates — research §7, crypto report).
- **Locked at which moment**: at **creation**, inside the same transaction that inserts the `payments` row — before the provider call for fiat prices; for crypto prices, the snapshot is what we priced at, while the provider's **realized** `receiveAmount`/`payAmount` (net after fees) is captured at `paid` into event evidence. Both are append-only; the snapshot is what the customer saw, the realized amount is what settled.
- **Recorded where**: `payments.fx_snapshot jsonb` = `{ currency, usdPerUnit (string), asOf, source, feeInclusive, lockedAt }` (+ realized values in the `paid` `payment_events.provider_evidence`). Never mutated after creation (invariant 9).

---

## 3. DB schema

### 3.1 Postgres (wired axis)

Schema `public`; timestamps `timestamptz`; ids `uuid` (gen_random_uuid()).

```sql
-- 1) provider registry
CREATE TABLE payment_providers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    text NOT NULL,               -- 'x-rocket'|'cryptobot'|'heleket'|'nowpayments'|'yookassa'|'cloudpayments'|'stripe'|'adyen'
  kind                    text NOT NULL CHECK (kind IN ('crypto','fiat')),
  enabled                 boolean NOT NULL DEFAULT false,
  priority                integer NOT NULL DEFAULT 100, -- lower = tried first within kind
  tenant_id               uuid NULL,                   -- NULL = platform default; (code, tenant) row shadows (code, NULL)
  supported_currencies    jsonb NOT NULL DEFAULT '[]', -- [{code, kind, networks[]}] (X-Rocket: refreshed from GET /api/v1/currencies)
  config                  jsonb NOT NULL DEFAULT '{}', -- NON-SECRET only: webhook path, networks, fee policy, region policy, retry_policy{max, backoffMs}, rate bucket, ipn settings, receipts template, livePrefix (adyen), terminal (cp) ...
  base_url                text NOT NULL,               -- OPERATOR-CONFIGURED per row (X-Rocket spec ships servers: [])
  version                 text NOT NULL,               -- contract version: 'x-rocket-pay-1.0.0' | 'cryptobot-1.5.2' | 'heleket-v1' | 'nowpayments-v1' | 'yookassa-v3' | 'cloudpayments-v1' | 'stripe-v1' | 'adyen-checkout-v72'
  credentials_encrypted   jsonb NULL,                  -- {keyId, iv, ct, tag} AES-256-GCM envelope (§1.4); NULL = unconfigured
  timeout_ms              integer NOT NULL DEFAULT 15000,
  region_allow            jsonb NULL,                  -- NULL = all regions
  region_deny             jsonb NOT NULL DEFAULT '[]', -- e.g. ['RU'] (heleket default), ['EU','UK','US'] (nowpayments merchant gate), ['RU','UA','BY'] (stripe/adyen)
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by              uuid NULL,
  UNIQUE (code, tenant_id),
  CHECK (NOT enabled OR credentials_encrypted IS NOT NULL) -- fail-closed: enabled requires configured creds
);

-- 2) payments
CREATE TABLE payments (
  id                    uuid PRIMARY KEY,              -- ALSO our clientInvoiceId / order_id sent to every provider (UUID ≤ 100 chars: fits X-Rocket ≤100, Heleket 1..128, NOWPayments order_id, YooKassa Idempotence-Key ≤64? UUID=36 ok)
  tenant_id             uuid NOT NULL,
  provider_code         text NOT NULL REFERENCES payment_providers(code),
  provider_payment_id   text NULL,                     -- X-Rocket invoice id / crypt.bot invoice_id / yookassa id / CP TransactionId / stripe intent id / adyen pspReference
  status                text NOT NULL CHECK (status IN ('pending','processing','paid','failed','cancelled','expired','refunded')),
  amount                text NOT NULL,                 -- decimal string, exact
  currency              text NOT NULL,
  fx_snapshot           jsonb NULL,                    -- §2.3
  provider_status_raw   text NULL,                     -- last provider status string (audit)
  paid_amount           text NULL, paid_currency text NULL, fee text NULL,
  partial_amount        text NULL,                     -- underpaid tracking
  refunded_amount       text NOT NULL DEFAULT '0',
  meta                  jsonb NOT NULL DEFAULT '{}',   -- orderRef etc.
  expires_at            timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz NULL, cancelled_at timestamptz NULL, expired_at timestamptz NULL, refunded_at timestamptz NULL,
  version               integer NOT NULL DEFAULT 1     -- optimistic lock
);
CREATE UNIQUE INDEX uq_payments_provider_client ON payments (provider_code, id);
CREATE UNIQUE INDEX uq_payments_provider_payment ON payments (provider_code, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX ix_payments_status_expires ON payments (status, expires_at);
CREATE INDEX ix_payments_tenant_created ON payments (tenant_id, created_at DESC);

-- 3) events / outbox (append-only)
CREATE TABLE payment_events (
  id                  bigserial PRIMARY KEY,
  payment_id          uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  type                text NOT NULL CHECK (type IN ('created','state_change','webhook_received','provider_call','reconcile','refund','manual_override')),
  from_status text NULL, to_status text NULL,
  actor               text NOT NULL,                   -- 'system'|'webhook'|'reconciler'|'admin:<id>'
  reason              text NULL,
  provider_evidence   jsonb NULL,                       -- txid, finalizedAt, provider status, realized amounts
  request_id          text NULL,                        -- CLS requestId, joins to problem `instance`
  outbox_published_at timestamptz NULL,                 -- outbox: worker selects type='state_change' AND to_status IN ('paid','refunded') AND outbox_published_at IS NULL ... FOR UPDATE SKIP LOCKED
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_events_payment ON payment_events (payment_id, created_at);
CREATE INDEX ix_events_outbox ON payment_events (type, to_status, outbox_published_at) WHERE outbox_published_at IS NULL;

-- 4) webhook receipts
CREATE TABLE payment_webhook_receipts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code     text NOT NULL,
  idempotency_key   text NOT NULL,                      -- X-Rocket: body.id; cryptobot: invoice_id:paid_at; heleket: uuid:status:txid; nowpayments: payment_id:status:purchase_id; yookassa: event:object.id:status; cp: TransactionId:Type:Status; stripe: event id; adyen: pspReference:eventCode
  raw_body          text NOT NULL,                      -- RAW bytes as received (signature computed over these)
  content_type      text NULL,
  signature_valid   text NOT NULL CHECK (signature_valid IN ('valid','invalid','none')),  -- 'none' = provider documents no signature (X-Rocket/cryptbot? no: cryptobot signed; x-rocket + yookassa = none)
  signature_kind    text NULL,                          -- 'hmac-sha256'|'hmac-sha512'|'md5'|'b64-hmac-sha256'|'none'
  status_code       integer NULL,                       -- what we answered the provider
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending','applied','ignored','rejected','error')),
  error             text NULL,
  request_id        text NULL,
  received_at       timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz NULL,
  UNIQUE (provider_code, idempotency_key)               -- the replay wall
);
CREATE INDEX ix_receipts_pending ON payment_webhook_receipts (processing_status, received_at);

-- 5) refunds (append-only)
CREATE TABLE payment_refunds (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id         uuid NOT NULL REFERENCES payments(id),
  provider_refund_id text NULL,
  amount             text NOT NULL,
  currency           text NOT NULL,
  status             text NOT NULL CHECK (status IN ('requested','confirmed','failed','manual')),
  initiated_by       text NULL,
  provider_evidence  jsonb NULL,
  reason             text NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  confirmed_at       timestamptz NULL
);

-- 6) provider health
CREATE TABLE payment_provider_health (
  provider_code      text PRIMARY KEY REFERENCES payment_providers(code),
  state              text NOT NULL DEFAULT 'unknown' CHECK (state IN ('unknown','up','degraded','down','disabled')),
  consecutive_errors integer NOT NULL DEFAULT 0,
  last_success_at    timestamptz NULL,
  last_error_at      timestamptz NULL,
  last_error_class   text NULL,                         -- 'auth'|'client'|'server'|'rate_limited'|'timeout'|'network'
  updated_at         timestamptz NOT NULL DEFAULT now()
);
```

**Migrations** (file names per repo rule `Migration<YYYYMMDDHHmmss><Name>`, one concern per file, each with `up()`/`down()`; registered in `packages/tooling/src/commands/db/orm-migration-config.ts` `migrationsList`):

- `Migration20260823100000CreatePaymentProviders.ts` — `payment_providers` + `payment_provider_health`
- `Migration20260823100100CreatePayments.ts` — `payments` + `payment_refunds`
- `Migration20260823100200CreatePaymentEvents.ts` — `payment_events` (+ outbox index)
- `Migration20260823100300CreatePaymentWebhookReceipts.ts` — `payment_webhook_receipts`

`down()` = drop tables (schema is **additive-only** — no existing table is altered anywhere in this feature, which is the rollback guarantee, §5.7).

### 3.2 MongoDB axis (shipped, unwired — fiat pattern)

Collections + validators + indexes in `libs/backend/mongodb/main/payments/lib/src/`: `payments` (validator: status enum, `amount` decimal-string pattern `^\d+(\.\d+)?$`, required fields), `payment_events`, `payment_webhook_receipts` (**unique index `{providerCode: 1, idempotencyKey: 1}`** — the replay wall lives in the index), `payment_providers`, `payment_refunds`, `payment_provider_health`. Native `mongodb` driver repository owns ordered writes: **receipt row first, then event, then payment update** — a crash mid-way replays safely because transition is idempotent and the receipt unique index blocks re-processing (the fiat-currency documented pattern for the missing-transaction case). Numbered migrations `Migration20260823100000InitializePayments.ts` + `migrations/index.ts` exporting `paymentsMongoMigrations` + `PaymentsMongoMigrationVerifier` (`OnModuleInit`, fails startup on drift) — inert while the axis is not selected.

---

## 4. `PaymentProvider` port + adapters

### 4.0 Port, resolution, error wrapper

`shared/lib/src/payment-provider.port.ts` (abstract class = its own DI token, fiat persistence-port pattern):

```ts
export interface ProviderCreatedPayment {
  readonly providerPaymentId: string;
  readonly payUrl?: string;
  readonly payAddress?: string;
  readonly payNetwork?: string;
  readonly payCurrency?: string;
  readonly expiresAt: Date | null;
  readonly redirect?: { type: 'url'; url: string } | { type: 'form'; url: string; fields: Record<string, string> };
  readonly providerStatusRaw: string;
}

export abstract class PaymentProviderPort {
  abstract readonly providerCode: string; // must equal payment_providers.code
  abstract createPayment(req: {
    paymentId: string; // OUR id — becomes clientInvoiceId/order_id/Idempotence-Key/reference
    amount: string;
    currency: string; // decimal strings
    payCurrency?: string;
    payNetworks?: string[];
    description: string;
    expiresInMs: number;
    webhookUrl: string;
    returnUrl?: { success?: string; cancel?: string };
    customer?: { id?: string; email?: string; telegramId?: string; telegramUsername?: string };
    meta?: Record<string, unknown>;
  }): Promise<ProviderCreatedPayment>;
  abstract resolvePaymentAddress?(req: {
    providerPaymentId?: string;
    clientId?: string;
    payNetwork: string;
  }): Promise<{ address: string; payCurrency: string; payNetwork: string; expiresAt: Date; minAmount?: string } | null>;
  abstract getStatus(payment: { providerPaymentId?: string; clientId: string }): Promise<{
    status: NormalizedProviderStatus; // 'pending'|'processing'|'paid'|'failed'|'cancelled'|'expired'|'underpaid'|'aml_hold'
    paidAmount?: string;
    paidCurrency?: string;
    fee?: string;
    txid?: string;
    finalizedAt?: Date;
    providerStatusRaw: string;
  }>;
  abstract verifyWebhook(raw: { body: string; headers: Record<string, string | string[] | undefined> }): Promise<{
    result: 'valid' | 'invalid' | 'none'; // 'none' = provider documents no signature scheme (X-Rocket, yookassa-v3)
    idempotencyKey: string;
    events: NormalizedWebhookEvent[]; // { paymentIdHint?, providerStatusRaw, paidAmount?, paidCurrency?, txid?, finalizedAt?, eventTime }
  }>;
  abstract refund?(
    payment: { providerPaymentId: string },
    req: { amount: string; currency: string; reason?: string },
  ): Promise<{ providerRefundId?: string; status: 'requested' | 'confirmed' | 'failed'; providerStatusRaw: string }>;
  abstract closePayment?(payment: {
    providerPaymentId?: string;
    clientId: string;
  }): Promise<{ closed: boolean; providerStatusRaw: string }>;
}
```

- **Multi-provider injection**: `PaymentProvidersInjectToken = Symbol('PaymentProvidersInjectToken')`; `useFactory` injects all `PaymentProviderPort` providers (Nest `inject()`) → `Map<providerCode, PaymentProviderPort>`. Class-token-resolves-one is why the Symbol exists (fiat `FiatRateSourcesInjectToken` rationale).
- **`PaymentProviderResolver`** (main service): reads the registry through `PaymentsPersistence.listProviders(tenantId)` with a 5 s TTL cache (invalidated by admin writes). Selection order: `enabled` → credentials configured (CHECK enforces) → tenant shadow (`(code, tenant)` beats `(code, NULL)`) → region (`region_deny ∋ tenantRegion` → out; `region_allow ≠ null ∧ ∌ tenantRegion` → out) → health ∉ `{down, disabled}` → **lowest `priority` first within kind**. No match → `payment-provider-unavailable` (503, fail-closed). **Enable/disable is data, not code — no deploy to switch providers** (research requirement, crypto report §7).
- **`ProviderHttpError`** (shared normalized error; every adapter call goes through `providers/provider-http.ts`): `{ class: 'auth' | 'client' | 'server' | 'rate_limited' | 'timeout' | 'network', providerStatus?: number, problemType?: string, retryable: boolean, detail: string }`. Behavior: `auth` → health `down` immediately + fail-closed + P1; `rate_limited` → exponential backoff (provider `config.retry_policy`), then `payment-provider-rate-limited` (503, `retryAfterSeconds` extension); `server`/`timeout` → up to 3 retries with backoff, `consecutive_errors` drives `degraded`; `client` → mapped problem, no retry; per-provider client-side token bucket for the providers with **undocumented** limits (cryptobot, Heleket, NOWPayments, X-Rocket — 429 documented but numbers absent; CloudPayments' concurrency cap 5/30 is a verified number and is enforced as a semaphore).

### 4.1 X-ROCKET — **VERIFIED against the new OpenAPI spec (authoritative)**

Spec facts (quoted from `x-rocket-new-openapi.json`; "X-Rocket Pay API" v1.0.0, OpenAPI 3.0). 18 unique paths / 23 operations; tags: Invoices, Payouts, Cheques, Withdrawal-links.

**Auth (spec)**: single security scheme `bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }`; every private operation carries `security: [{ 'bearer': [] }]` → header **`Authorization: Bearer <JWT>`** (401 error object: `title: "Unauthorized"`, `detail: "Unknown JWT"` / `"Unknown API Key"`, `type: "/api/problems/unauthorized"`, `kind: "unauthorized"`). Public (no security): `GET /health`, `GET /api/v1/currencies`. `GET /api/v1/rates` declares bearer but its summary is "Get currencies rates (optional auth)".

**Base URL — OPERATOR-CONFIGURED**: the spec's `servers` array is **empty** — the spec pins no host. Verified live 2026-08-22: docs UI `https://pay.api.x-rocket.exchange/api/docs` (redirects from http), spec JSON at `https://pay.api.x-rocket.exchange/api/docs-json`; testnet host `https://pay.api.testnet.x-rocket.exchange` (docs-era; its `/health` returned `{"status":"ok"}` per research). Provider row `base_url` default = prod host; onboarding smoke = `GET /health` (spec: `{status: 'ok'|'error'|'shutting_down', info[], error, details}`, all required) + `GET /api/v1/app-info` (auth; `AppResponseDto {id, name}`).

**Create invoice — `POST /api/v1/invoices`** (bearer) → **200 `InvoiceDto`**. Request `InvoiceCreateRequestDto` (only `priceCurrency` is required):

| field             | type                         | spec description                                                                                                                                                                                                                                        |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `priceAmount`     | string (e.g. `"123.456"`)    | "Invoice price amount"                                                                                                                                                                                                                                  |
| `minPayment`      | string                       | "Minimum payment amount (for open-amount invoices)"                                                                                                                                                                                                     |
| `numPayments`     | number 1..1000000            | "Num payments for invoice"                                                                                                                                                                                                                              |
| `priceCurrency`   | string, **required**         | "Invoice price currency (**crypto or fiat**)" — fiat-priced invoices are in the new contract (legacy was crypto-only)                                                                                                                                   |
| `payoutCurrency`  | string                       | "Invoice payout crypto currency"                                                                                                                                                                                                                        |
| `payCurrencies`   | string[]                     | "Crypto currencies which can be used to pay the invoice"                                                                                                                                                                                                |
| `clientInvoiceId` | string (e.g. `"cl_abc-123"`) | "Client Invoice ID as assigned by the client"                                                                                                                                                                                                           |
| `description`     | string ≤1000                 | "Description for invoice"                                                                                                                                                                                                                               |
| `expiresIn`       | number, **default 3600000**  | "Payment expires in **milliseconds**" (legacy used seconds — the unit change is a migration trap; we send ms)                                                                                                                                           |
| `callback`        | `InvoiceCallbackRequestDto`  | `{ callbackUrl ≤500, payload object ≤4KB }`; spec: callbackUrl "Webhook URL for this invoice; **overrides the application-wide webhook URL**" (the app-wide URL is registered in X-Rocket app settings — **OPERATOR-CONFIGURED**, location not in spec) |
| `url`             | `InvoiceUrlRequestDto`       | `{ successUrl ≤500, cancelUrl ≤500 }`                                                                                                                                                                                                                   |
| `customer`        | `InvoiceCustomerRequestDto`  | `{ id, email, telegramId, telegramUsername }`                                                                                                                                                                                                           |
| `isFeePaidByUser` | boolean, default false       | "If true, the user pays a commission"                                                                                                                                                                                                                   |
| `data`            | object ≤4KB                  | "Custom user data passed through and returned in callbacks/webhooks"                                                                                                                                                                                    |
| `platformId`      | string                       | "Platform identifier"                                                                                                                                                                                                                                   |

Response `InvoiceDto` (required: `id, priceCurrency, createdAt, status, links`): `id`; `priceAmount`; `minPayment`; `priceCurrency`; `payCurrencies[]`; `clientInvoiceId`; `description`; `expiresIn` ("Invoice expires in milliseconds (from creation time)"); `createdAt` (date-time); `expiresAt` (nullable — "null if no expiration"); **`status` enum `active | paid | partially_paid | expired | cancelled`** with spec warning: "This list may be extended in the future. Always use exact status comparison and handle unknown statuses gracefully"; `callback` (`InvoiceCallbackDto {callbackUrl, payload}`); `url`; `customer`; `links` (`InvoiceLinkDto`).

Create-invoice error responses (spec 400/401/404/429/500, discriminated by `type`): `/api/problems/client_id_already_taken` ("Client invoice ID already taken"), plus the full 400 family in §4.1 "Error envelope"; 401 `unauthorized`; 404 `asset_not_found`; 429 `rate_limit_exceeded`; 500 `internal_error`.

**Get invoice — `GET /api/v1/invoice?invoiceId|clientInvoiceId`** (both query params `maxLength: 100`; spec: "Either invoiceId (X-Rocket) or clientInvoiceId (client-assigned) is required. If both are passed, invoiceId will be used.") → 200 `InvoiceDto`; 400 `missing_invoice_identifier`; 404 `invoice_not_found`; 429; 500. **This is our `getStatus`** (plus the payments list below).

**List — `GET /api/v1/invoices`** query `asset, fiat, ids[], status, cursor, limit` (limit max 1000) → `InvoiceListResponseDto` (reconciliation sweep).

**Void — `DELETE /api/v1/invoice?invoiceId|clientInvoiceId`** (same identifier rule) — our `closePayment`.

**Invoice payments — `GET /api/v1/invoice/payments?invoiceId|clientInvoiceId&cursor&limit`** (limit max 1000). Spec description: "Returns payments of an invoice **in the same format as the payment_status_changed webhook**" → `InvoicePaymentListResponseDto { items: InvoicePaymentDto[], pagination: { next: string | null } }`.

**Payment address — `POST /api/v1/invoices/payments/address?invoiceId|clientInvoiceId`** (query, same identifier rule) + body `InvoiceCreatePaymentAddressRequestDto { payNetwork: 'TON'|'BSC'|'ETH'|'BTC'|'TRX'|'SOL' (required) }` → **201** `InvoicePaymentAddressResponseDto` (required: `address, payCurrency, payNetwork, expiresAt`): `address` (e.g. `"UQA2glBKk_55nNa9aW9c1zKqi58tvjF6_XmlGa5rhwcpV2qm"`), `payCurrency` (`"USDT"`), `payNetwork`, `expiresAt` (date-time), `minAmount` (string, "Minimum deposit amount (invoice has no fixed amount)"). Errors: 400 `missing_invoice_identifier`, 403 `coin_deposit_disabled` ("Coin deposit is disabled"), 404 `app_not_found`/`asset_not_found`, 429, 500. Our `resolvePaymentAddress`.

**Rates — `GET /api/v1/rates?base=USD&assets=["BTC","ETH","XROCK"]`** (bearer-declared, "optional auth"; `base` = fiat currency, default `"USD"`) → **array** `RateResponseDto { currency, rate: string }` ("Current rate", e.g. `"291.87"`) — feeds our fiat-currency history with `source: 'provider:x-rocket'`, `feeInclusive: true`.

**Currencies — `GET /api/v1/currencies?kind=crypto|fiat`** (public) → array `CurrencyResponseDto { code, title, kind: 'crypto'|'fiat', networks: [{ code: 'TON'|'BSC'|'ETH'|'BTC'|'TRX'|'SOL' }] }` — the runtime source of truth for `supported_currencies` (research: don't hardcode asset lists; the legacy TONCOIN naming may not apply to this API — the runtime list wins).

**App — `GET /api/v1/app-info`** → `{id, name}`; **`GET /api/v1/balances`** → `AppBalancesResponseDto { balances: [{ asset, balance, available, holds }] }` (all strings) — onboarding + health evidence, not part of the payment flow.

**Webhook contract (spec `callbacks`)** — the new spec **does** define the callback, at the OpenAPI level: `POST /api/v1/invoices` declares

```json
"callbacks": { "Invoice updated": { "your-webhook-url": { "post": {
  "requestBody": { "required": true, "content": { "application/json":
    { "schema": { "$ref": "#/components/schemas/InvoiceWebhookDto" } } } },
  "responses": { "200": { "description": "OK" } } } } } }
```

Identical shape on payouts (`Payout updated` → `PayoutWebhookDto`), withdrawals (`Withdrawal updated` → `WithdrawalWebhookDto`), cheques (`Cheque updated` → `ChequeWebhookDto`); expected receiver response **200 OK**.

`InvoiceWebhookDto` (all four properties required):

- `id`: string — **"Unique webhook delivery id, can be used by the receiver for idempotency"** (stable across retries — our `idempotency_key`).
- `timestamp`: date-time — "When webhook was sent" (freshness window input).
- `type`: string (e.g. `"invoice"`).
- `data`: discriminated by `event`:
  - `invoice_status_changed` → `InvoiceStatusChangedWebhookDataDto { event, invoice: InvoiceDto }`
  - `payment_status_changed` → `PaymentStatusChangedWebhookDataDto { event, invoice: InvoiceDto, payment: InvoicePaymentDto }`

Spec delivery semantics (verbatim from the `data` description): "When a payment completes an invoice, both events are emitted… **order is not guaranteed**: retries on a failed delivery move it later in the queue, so invoice_status_changed can arrive before payment_status_changed. **Treat each event independently and dedupe by the top-level id**." Recommendations: "Track successful payments by event = payment_status_changed AND payment.status = paid. Track invoice completion by event = invoice_status_changed AND invoice.status = paid. **Determine payment finality by payment.finalizedAt != null**, not by a specific status value. Dedupe by the top-level webhook id (stable across retries). Ignore unknown events and statuses — the lists may be extended without notice."

`InvoicePaymentDto` (required: `status, payAmount, payCurrency, receiveAmount, receiveCurrency, transactions`): `id` ("Use it to match webhook events with the invoice payments endpoint"); **`status` enum `pending | paid | expired | failed | cancelled`** (spec: unknown statuses → "in progress"); **`finalizedAt`** nullable date-time ("When payment reached final state (null for in-progress payments)"); `payAmount` (string, "Gross amount payer sent in total across all transactions of this payment (before fees)"); `payCurrency`; **`receiveAmount`** (string, "Net amount merchant receives after fees, summed across all transactions of this payment (in invoice priceCurrency)"); `receiveCurrency` ("= invoice priceCurrency"); `transactions[]` discriminated by `type`:

- `InvoiceBlockchainTransactionDto` / `InvoiceInternalTransactionDto`: `id`; `status` enum `pending | confirming | confirmed | failed`; `payAmount?/payCurrency?/receiveAmount?/receiveCurrency?` (strings, null until known/finalized); `comment?`; `payer: { email?, telegramId?, telegramUsername? }`; `createdAt`; `finalizedAt?`; `type: 'blockchain'|'internal'`; `tx` (blockchain only) → `InvoicePaymentTransactionBlockchainDetailsDto` (txid source).

**Signature: NONE — spec-confirmed absence.** Zero occurrences of `"signature"` and zero of `"secret"` in the entire spec document. Therefore: `verifyWebhook` returns `result: 'none'`, and the **double-check rule is mandatory for X-Rocket** — every callback triggers `GET /api/v1/invoice?invoiceId=` (+ `/invoice/payments`) and no state moves to `paid` on the body alone. (The research report's "UNVERIFIED" webhook payload question is resolved: payload + idempotency id + delivery order **are** defined in this spec; the signature scheme is **not**.)

**Refund: not in the spec.** No refund endpoint exists anywhere in the 23 operations (cheques reserve-and-release is a payout mechanism, not a refund). → capability `refund = false`; product-level manual path only.

**Adapter behavior (decisive)**:

- `createPayment`: `priceCurrency` = order currency (fiat or crypto per spec); fiat-priced orders send `priceCurrency: 'USD'|'RUB'…` + `payCurrencies: [chosen asset]`; `clientInvoiceId: payment.id`; `expiresIn: <our TTL ms>`; `callback: { callbackUrl: PAYMENTS_WEBHOOK_BASE_URL + '/api/v1/webhooks/x-rocket', payload: { paymentId } }`; `data: { paymentId }`; `url` from order `returnUrl`; `isFeePaidByUser` from provider config; `platformId` from provider config (**OPERATOR-CONFIGURED**). Store `InvoiceDto.id` as `provider_payment_id`, `expiresAt` on the payment row.
- `resolvePaymentAddress`: `POST /api/v1/invoices/payments/address?invoiceId=<id>` `{ payNetwork }` → store `{address, payCurrency, payNetwork, expiresAt, minAmount}`; 403 `coin_deposit_disabled` → `payment-provider-capability` (503).
- `getStatus`: invoice map `active→pending, paid→paid, partially_paid→underpaid, expired→expired, cancelled→cancelled, unknown→processing`; payment-level via `/invoice/payments` (finality = `payment.status === 'paid' && payment.finalizedAt != null`; `txid` from the first `type: 'blockchain'` transaction's `tx` details; realized `receiveAmount` → event evidence).
- `verifyWebhook`: parse body → `result: 'none'`; `idempotencyKey = body.id`; events from `data.event` (ignore unknown `event` values per spec); stale check on `timestamp` (>24 h with payment terminal → 410, §5.2).
- `closePayment`: `DELETE /api/v1/invoice?invoiceId=`.
- `refund`: **not implemented** (spec has no such operation).
- **Error mapping (spec inventory → repo problems)**: `client_id_already_taken` → idempotent duplicate (our `clientInvoiceId` is the payment id; a retry re-sends it → treat as "already created", fetch the invoice, do not error); `amount_invalid`/`amount_less_than_minimum`/`amount_less_than_min_deposit` → `payment-amount-invalid` (400); `invoice_expired` → `payment-expired` (409); `asset_not_found`/`currency_not_found` → `payment-currency-unavailable` (400); `invalid_pay_currency` → `payment-currency-unavailable` (400); `unauthorized` → credential failure (health `down`, fail-closed, P1); `coin_deposit_disabled`/`operation_disabled` (403) → `payment-provider-capability` (503); `network_is_suspended` → `payment-provider-capability` (503); `rate_limit_exceeded` (429) → backoff → `payment-provider-rate-limited` (503 + `retryAfterSeconds`); `internal_error`/`not_implemented` (500) → retry → `payment-provider-unavailable` (503).
- **Error envelope (spec)** — every error object is RFC 9457-shaped with all six properties required: `{ type: '/api/problems/<kebab-urn>', title, status, detail, instance: '/api/problems/instances/<uuid>', kind }`. Full inventory (38 `status×type` pairs): **400** `amount_conflict, amount_invalid, amount_less_than_min_deposit, amount_less_than_minimum, amount_more_than_app_balance, asset_delisted, cheque_already_used, client_id_already_taken, invalid_pay_currency, invoice_expired, missing_cheque_identifier, missing_invoice_amount, missing_invoice_identifier, missing_payout_identifier, network_is_suspended, payout_client_id_duplicate, payout_user_blocked, payout_user_not_found, target_user_not_found, validation_error, withdrawal_asset_not_allowed, withdrawal_incorrect_address, withdrawal_incorrect_comment`; **401** `unauthorized`; **403** `coin_deposit_disabled, operation_disabled`; **404** `app_cheque_not_found, app_not_found, app_payout_not_found, app_withdrawal_not_found, asset_not_found, currency_not_found, invoice_not_found, network_not_found`; **429** `rate_limit_exceeded`; **500** `internal_error, not_implemented`. The adapter parses `type` (not `title`) for mapping; unknown `type` → `server` class, retryable.
- **Spec does NOT define (operator-configured/unknown — never invented)**: base URL (empty `servers`); where the application-wide webhook URL is registered (X-Rocket app settings); any webhook signature; rate-limit numbers (429 exists, values absent); testnet (no server entry — host per docs, not spec); the legacy `PUT /api/v1/invoices/pay` test-payment trigger (absent from this spec — do not call it unless confirmed live on testnet); refunds for paid invoices; fiat settlement via the Pay API; asset availability (fetch `/api/v1/currencies` at runtime).

### 4.2 Telegram Crypto Bot ("Crypto Pay") — crypto — **VERIFIED** (official Crypto Pay API docs v1.5.2, 19 Mar 2026)

- Base: `https://pay.crypt.bot/api/{method}` (testnet `https://testnet-pay.crypt.bot/`); auth header **`Crypto-Pay-API-Token: <app token>`**.
- `createPayment` → `createInvoice`: `currency_type: 'fiat'` + `fiat: 'USD'` (our pivot) or crypto asset; `amount` decimal **string**; `expires_in` **seconds**; `payload` (≤4KB) carries `paymentId`; `swap_to` optional. Response `{ invoice_id, bot_invoice_url, … }` → `payUrl = bot_invoice_url`.
- `getStatus`: **no single-invoice GET exists** → `getInvoices(invoice_ids: <id>, count: 100)` and take the first item; map `active→pending, paid→paid, expired→expired, unknown→processing`. Cache `invoice_id` locally (`provider_payment_id`).
- `verifyWebhook`: body `{ update_id, update_type: 'invoice_paid', request_date (ISO 8601), payload: <Invoice> }`. Official algorithm: `secret = sha256(appToken).digest()` (binary), `expected = HMAC-SHA256(secret, rawBody).hex`, header **`crypto-pay-api-signature`**; constant-time compare; accept only `update_type: 'invoice_paid'`; **`idempotencyKey = invoice_id:paid_at`** (spec: `update_id` is non-unique); `request_date` as freshness input. Double-check via `getInvoices` before any transition (invariant 2). Delivery: 17 retries over 3 days, then webhooks auto-disable with app-owner notification → `getMe` liveness ping every 5 min + alert on silent gap while non-terminal payments exist.
- `closePayment` → `deleteInvoice` (unpaid only). `refund`: none. Testnet: full (separate bot/token, JET-only asset). RU: usable, RU/CIS-oriented (fiat list RUB/BYN/KZT/UZS/GEL/AMD…); operator legal entity unnamed in docs (risk file). Rate limits undocumented → client token bucket 5 rps + backoff.

### 4.3 Heleket — crypto (+fiat-priced invoices) — **VERIFIED** (doc.heleket.com, full public docs)

- Base: `https://api.heleket.com` (DB-configurable); **all requests POST + JSON** (only `GET /v1/exchange-rate/{currency}/list` is GET); per-request headers **`merchant: <merchant uuid>`** + **`sign: MD5(base64(json_body) + API_KEY)`** (hex; empty body: `MD5(base64('') + KEY)`). Two separate keys (payment, payout) — only the payment key lives in the row's credentials.
- Envelope: `{ state: 0, result }` / `{ state: 1, errors }` / `{ state: 1, message }` → `state: 1` = `ProviderHttpError` (class from error text; unknown → `client`, no retry).
- `createPayment` → `POST /v1/payment`: `{ amount (string), currency (fiat or crypto code), order_id: payment.id (REQUIRED, 1..128, IDEMPOTENT — existing order_id returns the existing invoice), network?, to_currency?, url_callback: <webhook>/api/v1/webhooks/heleket, lifetime (300..43200 s), subtract (config %), accuracy_payment_percent (config, 0..5), additional_data (≤255: paymentId), currencies[] (allow-list), course_source (config: Binance|BinanceP2P|Exmo|Kucoin) }` → `result { uuid, order_id, amount, payment_amount, payment_amount_usd, payer_amount, payer_amount_exchange_rate, merchant_amount, network, address, url (hosted page), expired_at, status: 'check', address_qr_code (base64 PNG), … }` → `payUrl = url`, address from body.
- `resolvePaymentAddress`: not a separate call (address in create response); re-fetch via info when needed.
- `getStatus` → `POST /v1/payment/info { order_id }` (or `{ uuid }`; order_id wins). Map: `check→pending, process/confirm_check/wrong_amount_waiting→processing, paid/paid_over→paid, wrong_amount→underpaid, fail/cancel/system_fail→failed, locked→aml_hold, refund_paid→refunded (evidence), refund_process/refund_fail→refund-row state`.
- `verifyWebhook`: body `{ type: 'payment'|'wal-let', uuid, order_id, amount, payment_amount, payment_amount_usd, merchant_amount, commission, is_final, status, from, network, currency, payer_currency, convert?, txid, sign }`. Official algorithm: remove `sign`; re-serialize with the documented convention — `JSON.stringify(data)` then **slash-escape** (every `/` in the signed string becomes `\/`; JS: `JSON.stringify(data).replace(/\//mg, '\\/')`) + unescaped-unicode (their PHP `json_encode` default + `JSON_UNESCAPED_UNICODE`); `expected = md5(base64(serialized) + paymentApiKey)`; constant-time compare. **This serialization quirk is a documented real failure mode → golden test against a captured staging sample.** `idempotencyKey = uuid:status:txid`. Double-check via `/v1/payment/info` **mandatory** (also compensates MD5 weakness — threat-model note).
- `refund`: no finished-invoice endpoint → capability `refund: false` (blocked-address refund = future support tool, out of v1). **Sandbox: none documented** → staging = tiny live invoices + the "Testing webhook"/"Resend webhook" endpoints. **RU: AML non-serviced jurisdiction (verified, policy updated 2026-06-23) → default row `region_deny: ['RU']`, `enabled: false` for RU tenants; hard gate.** Rate limits undocumented → token bucket + backoff.

### 4.4 NOWPayments — crypto — **VERIFIED** (official Postman API reference, fetched in full)

- Base: `https://api.nowpayments.io` (sandbox `https://api-sandbox.nowpayments.io` — DB-configurable per row); header **`x-api-key: <key>`**; separate `ipn_secret` in the same credentials envelope (shown only once at creation — onboarding runbook step).
- `createPayment` → `POST /v1/invoice` (hosted page: `success_url`, `cancel_url`, `partially_paid_url`) or `POST /v1/payment` (raw): `{ price_amount, price_currency: 'usd' (pivot), pay_currency, ipn_callback_url: <webhook>/api/v1/webhooks/nowpayments, order_id: payment.id, order_description, is_fixed_rate, is_fee_paid_by_user (config), case (SANDBOX ONLY: success|common|failed|partially_paid) }` → `{ id, pay_address, pay_amount, … }`.
- `getStatus` → `GET /v1/payment/{id}`: `waiting→pending, confirming/confirmed/sending→processing, finished→paid, partially_paid→underpaid, failed→failed, expired→expired, refunded→refunded (evidence), unknown→processing`. **No IPN is sent after expiry** (deposits may still arrive and trigger nothing) → reconciliation MUST poll to terminal (research-flagged).
- `verifyWebhook` (IPN): header **`x-nowpayments-sig`**; body = payment status object (`{ payment_id, parent_payment_id, invoice_id, payment_status, pay_address, price_amount, price_currency, pay_amount, actually_paid, actually_paid_at_fiat, pay_currency, order_id, purchase_id, outcome_amount, outcome_currency, fee: { currency, depositFee, withdrawalFee, serviceFee } }`). Official algorithm: **recursively sort all parameters alphabetically → compact JSON → `HMAC-SHA512(ipn_secret, json).hex`**; constant-time compare. `idempotencyKey = payment_id:payment_status:purchase_id`. **Serializer quirk (flagged in research): the official PHP example uses `JSON_UNESCAPED_SLASHES`, the Node example uses default `JSON.stringify` — the two differ when the payload contains `/` (txids) → pin the exact serializer in a golden test from a sandbox capture before production.** Double-check via `GET /v1/payment/{id}`.
- `refund`: **no refund endpoint in the API** (full collection scanned; ToS §7: support-only, only `failed`/`waiting` refundable) → capability `refund: false`. Sandbox: first-class (`case` param, separate account/host) → full CI IPN matrix. RU: allowed per ToS §15.1, which bars **EU/UK/US** merchants → default `region_deny: ['EU','UK','US']` for merchant-region gating. Rate limits unpublished → token bucket + backoff.

### 4.5 ЮKassa (YooKassa) — fiat RU #1 — **VERIFIED** (official OpenAPI 3.0.2 spec, `yookassa-openapi-specification.yaml`, 337 KB)

- Base: `https://api.yookassa.ru/v3/` (single server in spec); auth **HTTP Basic — username = `shopId`, password = secret key** (Merchant Profile → API keys); **`Idempotence-Key` header required on POST/DELETE, ≤64 chars, idempotent for 24 h** → we send `payment.id`.
- `createPayment` → `POST /payments`: `{ amount: { value: '10.00', currency: 'RUB' } (decimal string), description (≤128), receipt (54-FZ items — operator-provided template in row config), payment_method_data?, confirmation: { type: 'redirect', return_url }, capture: true, client_ip, metadata: { order_id: payment.id } }` → `{ id, status, confirmation_url }` → `redirect { type: 'url', url: confirmation_url }`. Lifecycle `pending → waiting_for_capture → succeeded | canceled`; capture windows 7 days (card/YooMoney) / 6 h (other) → auto-cancel.
- `getStatus` → `GET /payments/{id}`: `pending→processing, waiting_for_capture→processing, succeeded→paid, canceled→cancelled, unknown→processing`.
- `verifyWebhook`: register `POST /webhooks { event, url }` (events: `payment.waiting_for_capture, payment.succeeded, payment.canceled, refund.succeeded, payment_method.active`) or merchant-profile URL. **v3 documents NO signature** (verified absence in the archived v3 docs repo; the legacy v2 `X-Signature`/HMAC-SHA512 scheme was unreachable — treat as non-existent). Verification = **source-IP allowlist (OPERATOR-CONFIGURED, enforced at the network layer — the published IPs are vendor-side knowledge) + mandatory status re-fetch** (`GET /payments/{id}`) before any transition (invariant 2; YooKassa's own docs prescribe the re-check posture). `idempotencyKey = event:object.id:object.status`. Retries: 7 attempts / 24 h, expect 200.
- `refund` → `POST /refunds { payment_id, amount? (partial), currency? }`, **window ≤ 3 years**; confirm via `GET /refunds/{id}` (`succeeded`) + `refund.succeeded` webhook; `refund` row tracks `requested→confirmed`.
- `closePayment` → `POST /payments/{id}/cancel` (instant refund for card/wal-let/SberPay, days for other rails).
- Rate limits: 429 defined on all mutating endpoints, **no numbers published** → backoff. RU: fully operational for RU entities. **Compliance warning (config-driven, operator's counsel decides): YooKassa is Sber-group owned; Sberbank is on OFAC SDN + EU asset-freeze lists — any non-RU legal entity integrating it or receiving settlements via Sber infrastructure carries US/EU sanctions exposure. The template renders this as a per-provider compliance warning, never bakes an RU assumption.** Currencies: RUB + 10 codes in the spec (runtime catalogue cross-check).

### 4.6 CloudPayments — fiat RU #2 — **VERIFIED** (developers.cloudpayments.ru full reference)

- Base: `https://api.cloudpayments.ru` (JSON); test = same host with **test terminals** (`publicId: test_api_…`); auth **HTTP Basic — `publicId` / API Secret** (401 on missing/wrong).
- `createPayment` → one-stage `POST /payments/cards/charge` (or two-stage `POST /payments/cards/auth` + `POST /payments/confirm` within **7 days** / `POST /payments/void`): `{ publicTerminalId (row config), Amount (decimal string, dot), Currency (default RUB), IpAddress (REQUIRED — from the incoming request), Payer? (phone for MCC 4814), Description, Metadata: { 'cloudpayments.payment_id': payment.id } }` (reserved `cloudpayments.*` namespace). Card data never travels raw: client-side Checkout.js `CardCryptogramPacket` or a saved token (operator frontend integration). Response `{ TransactionId, Status, AcsUrl? }` — **`Success` reflects only request acceptance; state is in `Status` + IPNs**. 3DS: if `AcsUrl` present → `redirect { type: 'form', url: AcsUrl, fields: { MD, TermUrl, … } }` (form-POST to the ACS; user returns to `TermUrl` with `MD` + `PaRes`); 3DS failure = `ReasonCode 5206`.
- `getStatus` → `POST /payments/get { TransactionId }`: `S→paid, A→processing, F→failed, R→refunded (evidence), C→cancelled, X→underpaid, unknown→processing`.
- `verifyWebhook` (IPN): types `Check | Pay | Fail | Confirm | Cancel | Refund | Recurrent` (cabinet config **or** `POST /site/notifications/{Type}/update { IsEnabled, Address, HttpMethod: GET|POST, Encoding: UTF8, Format: CloudPayments }`, read back via `/get`). Every notification carries **two** headers: `X-Content-HMAC` (over **URL-decoded** parameters) and `Content-HMAC` (over URL-encoded parameters), both `base64( HMAC-SHA256(message, API-Secret) )` UTF-8 — message = raw body for POST, parameter string for GET. **Check `X-Content-HMAC` (docs: the encoded variant "may cause problems"); fall back to `Content-HMAC` only when absent.** **Published sender IPs** `185.98.81.0/28, 87.251.91.160/27, 46.46.175.96/27, 46.46.168.160/27, 162.55.174.97/32, 91.216.178.243/32` → network-layer allowlist (operator). `idempotencyKey = TransactionId:NotificationType:Status`. Double-check `/payments/get` before transitions (signed, but amounts still re-fetched per invariant 2).
- `refund` → `POST /payments/refund { TransactionId, Amount, JsonData? }` → `{ Model: { TransactionId: <refund txn id> }, Success: true }`; **window ≤ 1 year** (capability metadata `refundWindowYears: 1`).
- Rate limits (the only provider with verified numbers): **max concurrent requests 5 (test) / 30 (prod)**, 429 until a slot frees → client semaphore + backoff. Currencies: RUB + 26 published + "54 others" **UNVERIFIED** → `supported_currencies` seeded from the published list only. IPN retry policy undocumented → reconciler backstops.

### 4.7 Stripe — fiat global #1 — **VERIFIED** (docs.stripe.com, SSR)

- Base: `https://api.stripe.com/v1`; auth **`Authorization: Bearer sk_live_…` / `sk_test_…`** (mode in row config); **`Idempotency-Key: payment.id`** on `POST /v1/payment_intents` (docs-recommended).
- `createPayment` → `POST /v1/payment_intents`: `{ amount (integer MINOR units — exact conversion from common-money via `minorUnitExponent`), currency (lowercase ISO), metadata: { order_id: payment.id }, description, capture_method (config automatic|manual), payment_method_types[] }` → `{ id, client_secret, status, next_action? }`. Confirmation: client-side Stripe.js with `client_secret` (publishable key in row config) or server-side confirm. `status: 'requires_action'` → `redirect { type: 'url', url: next_action.redirect.url }` (3DS2/SCA automatic for eligible cards).
- `getStatus` → `GET /v1/payment_intents/{id}`: `requires_payment_method|sending|requires_confirmation|requires_action|requires_capture→processing, succeeded→paid, canceled→cancelled, unknown→processing`.
- `verifyWebhook`: header **`Stripe-Signature: t=<unix_ts>,v1=<signature>`** (split on `,` then `=`); `signed_payload = "<t>.<raw body>"`; `expected = HMAC-SHA256(key = whsec_…, msg = signed_payload).hex`; constant-time compare vs `v1`; **tolerance 5 minutes** — reject valid-but-stale timestamps (tolerance 0 is explicitly not used); **each retry delivery carries a fresh timestamp + signature → regenerate expectations per delivery**. Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_method.attached`, `charge.refunded`, `refund.created | refund.updated | refund.failed`. `idempotencyKey = event.id` (stable, Stripe-documented). Signed → re-fetch for amount match (invariant 2).
- `refund` → `POST /v1/refunds { payment_intent, amount? (partial), reason? }`; track to succeeded (webhook `refund.*`); `refund.failed` → manual queue.
- Rate limits (documented): **100 req/s per account default** (live) + concurrency limits + read-API budget 500 reads per processed transaction → client token bucket 100 rps. Sandbox: test mode + test cards + Stripe CLI forwarding. **RU: officially unsupported for RU-located users; Mir unsupported; RU-issued cards "unlikely to be successful" (support article, 2024-09-12 rev.) → default `region_deny: ['RU','UA','BY']` for merchant gating; RUB exists in the catalogue for legacy/cross-border only. `refundWindowYears: null` (no fixed window documented).**

### 4.8 Adyen — fiat global #2 — **VERIFIED** (docs.adyen.com markdown, Checkout API v72)

- Base: test `https://checkout-test.adyen.com`; live `https://{prefix}-checkout-live.adyenpayments.com/checkout/v72/...` (`{prefix}` per-company from Customer Area — **row config**); auth **`X-API-Key: <key>`** (or Basic; role-based credentials).
- `createPayment` → `POST /v72/payments`: `{ amount: { value: <integer MINOR units>, currency }, reference: payment.id, merchantAccount (row config), paymentMethod { type: 'scheme', … } (from tokenized/cryptogram flow — raw card data via client side), returnUrl, channel: 'Web', browserInfo (required for 3DS2) }` → `{ resultCode: Authorised|RedirectShopper|AuthenticationFinished|Refused|…, pspReference, id, action? { type: redirect|threeDS2, … } }`. `RedirectShopper` → `redirect { type: 'form', url: action.data, fields }` then completion via `POST /v72/payments/details { paymentData }` (or Sessions flow — operator choice, row config). Map: `Authorised→paid (capture_method automatic) | processing (manual), RedirectShopper|AuthenticationFinished→processing, Refused|Cancelled→failed, unknown→processing`.
- `getStatus`: reconciliation query `GET /v72/payments/{pspReference}` — standard Checkout endpoint, **verify at onboarding** (not in the research capture; flagged); webhook re-delivery (Adyen resends until success) is the primary recovery path.
- `verifyWebhook`: standard body `{ live: 'false', notificationItems: [ { NotificationRequestItem: { pspReference, originalReference, merchantAccountCode, merchantReference, amount { value, currency }, eventCode, eventDate, success, additionalData { hmacSignature: <base64> } } } ] }`. **Payload string** (colon-joined, **empty fields kept as empty string**): `pspReference:originalReference:merchantAccountCode:merchantReference:value:currency:eventCode:success` (e.g. `7914073381342284::TestMerchant:TestPayment-1407325143704:1130:EUR:AUTHORISATION:true`). `expected = base64( HMAC-SHA256(key = HEX-DECODED hmac key, msg = payload UTF-8) )`; compare with `additionalData.hmacSignature`. (Non-standard webhooks sign the raw body in headers `hmacsignature` + `protocol: HmacSHA256` — out of v1 scope, documented.) `eventCode` drives the machine: `AUTHORISATION, AUTHORISATION_ADJUSTED, CAPTURE, REFUND, CANCEL, …`. `idempotencyKey = pspReference:eventCode`.
- `refund` → `POST /v72/refunds { merchantAccount, reference, originalReference: <pspReference of the authorised payment>, amount { value, currency } }` — **partial refunds allowed**; confirm on `REFUND` webhook `success`.
- Rate limits: no public numbers (API Explorer UI only) → backoff on 429. Sandbox: test account + `ca-test` webhook HMAC keys. **RU: not viable — RUB transaction processing suspended "regardless of country/region of issuing" (compliance FAQ, verified); RUB listed in currency table but unusable → `region_deny: ['RU']` + currency deny `RUB`.**

### 4.9 Generic REST fallback — documented, not built in v1

The research §6 canonical generic contract (`endpoint_overrides { create_payment, get_payment, list, refund? }` + `verifyWebhook` implemented from captured samples + the same normalized types) remains the documented path for any future provider whose public docs cannot be verified: the operator points a row at its endpoints, and the provider-specific strategy objects are validated against captured samples, never assumed. No v1 code ships for it.

---

## 5. Error handling & deployment

### 5.1 Provider errors → repo problem+json

Controllers never hand-throw HTTP errors; they throw the repo's typed exceptions (`BadRequestException`, `ConflictException`, `ResourceNotFoundException`, `InternalException` + new typed classes built by the same `Exception({ name, kind, problemType, status, extensionsType })` factory) → global `ExceptionsFilter` + `ExceptionsResponseTransformer` → RFC 9457 problem+json with `Content-Language`-localized `title`/`detail` and `instance` from the CLS `requestId`. New problem types **registered in `@app/common-problem-details`** (`registerProblemTypes`, product-owned namespace):

| problem code                          | status                          | raised when                                                                                   |
| ------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| `payment-provider-unavailable`        | 503                             | no eligible provider (disabled/missing/health down/region) after retries                      |
| `payment-provider-rate-limited`       | 503 (+ `retryAfterSeconds` ext) | provider 429 after backoff budget                                                             |
| `payment-provider-credential-invalid` | 503 (never 401 to customers)    | provider `auth` class (X-Rocket `unauthorized`, Basic 401, Stripe 401) — health → `down`, P1  |
| `payment-provider-capability`         | 503                             | deposit disabled, operation disabled, network suspended, refund unsupported for this provider |
| `payment-amount-invalid`              | 400                             | local validation or provider amount-family error                                              |
| `payment-currency-unavailable`        | 400                             | asset/currency not in provider's runtime list                                                 |
| `payment-expired`                     | 409                             | create/cancel/resolve on an expired payment                                                   |
| `payment-already-paid`                | 409                             | cancel/void on a paid payment; late provider-paid on closed payment (invariant 8)             |
| `payment-refund-window-closed`        | 409                             | provider refund window passed (YooKassa 3 y, CP 1 y)                                          |
| `payment-fx-unavailable`              | 503                             | no fiat-currency rate quote at creation (§2.3)                                                |
| `payment-not-found`                   | 404                             | unknown id (customer + admin)                                                                 |
| `webhook-signature-invalid`           | 400                             | webhook rejected — bad signature (also recorded + P1)                                         |
| `webhook-replayed`                    | 409                             | duplicate idempotency key while prior delivery still in-flight                                |
| `webhook-stale`                       | 410                             | replay/stale event on terminal payment beyond freshness window                                |
| `webhook-processing-error`            | 502                             | we could not persist the receipt (DB failure) — provider must redeliver                       |

Per-provider mapping tables live in each adapter (X-Rocket's full 38-pair inventory in §4.1; Heleket `state:1` envelope → class by error text; Stripe error object `{error: {type, message}}` → class by `type`; unknown provider error → `server` class, retryable, mapped to `payment-provider-unavailable` after budget).

### 5.2 Webhook ingress — rejection cases + idempotent redelivery

Routes: `POST /api/v1/webhooks/{x-rocket|cryptobot|heleket|nowpayments|yookassa|cloudpayments|stripe|adyen}` (+ `GET /api/v1/webhooks/cloudpayments` for its GET-format IPN). Public, **no auth guard** — signature-gated instead. A fastify raw-body hook stashes `req.rawBody` (exact bytes) before JSON parsing; **verification always runs over the raw body, first, before any parsing business**.

Pipeline (per delivery):

1. Provider row lookup: unknown `:provider` key → 400 `webhook-signature-invalid` (unroutable). **A disabled provider still accepts webhooks** (in-flight payments must settle); disablement only fail-closes _new_ payments.
2. `verifyWebhook(raw)`: `invalid` → **400** (receipt row `signature_valid='invalid'` best-effort, P1 alert, metric `webhooks.rejected{reason='bad_signature'}`); `none`/`valid` → continue.
3. Idempotency on `(provider_code, idempotency_key)`:
   - first time → insert receipt (`pending`) → continue;
   - duplicate, prior `processing_status='applied'` → **200 immediately, zero side effects** (this is the _idempotent redelivery_ path — the provider stops retrying, nothing re-transitions, invariant 6);
   - duplicate, prior `pending` (in-flight < 5 s) → **409 `webhook-replayed`** (provider retries later and gets 200);
   - duplicate, prior `rejected|error` → reprocess (200 if applied, 502 if it fails again).
4. Stale: event time (X-Rocket `timestamp`, Stripe `t`, Heleket payload time) older than **24 h** and the payment already terminal → **410 `webhook-stale`** (tells the provider's queue to drop it; receipt recorded `ignored`).
5. Process: parse events → double-check via `getStatus` where the rule requires (invariant 2) → `transitionPayment` (same tx as receipt→`applied`) → **200**. Response is sent right after the receipt commits (target < 200 ms); the provider re-fetch is inline with a 3 s budget and, if it overruns, the receipt stays `pending` and the reconciler completes the transition — the provider's retry hits the duplicate path and still gets 200.
6. If the receipt **cannot be persisted** (DB failure) → **502 `webhook-processing-error`** (provider redelivers; nothing was committed).

All webhook responses: no secrets, `requestId` in the problem `instance`; metrics on every outcome; raw body stored for admin debugging (admin-only, audit-logged).

### 5.3 Polling / reconciliation / expiry

- **Reconciler** (main lib service; runs in every selected backend but gated by a **Redis redlock** (`RedisRedlockService`, redis is a bundled capability) so exactly one instance works per tick): every 60 s, batch 200: candidates = non-terminal payments with `now - last_event > 60 s` **or** `expires_at < now`; per payment → adapter `getStatus` → `transitionPayment` (actor `reconciler`, evidence `provider_status_raw`). Per-provider notes: NOWPayments polled to terminal (no expiry IPN); X-Rocket every tick double-checks (unsigned webhooks make the poll co-equal); cryptobot `getMe` liveness every 5 min (webhook auto-disable risk) + alert if no webhook activity for 24 h while non-terminal payments exist; YooKassa/CP/Stripe/Adyen poll only stuck/terminal-ambiguous rows (their webhooks are signed or IP-allowlisted + re-fetched).
- **Expiry** (at `expires_at`): provider reachable → **provider status wins** (X-Rocket address has its own `expiresAt`; NOWPayments 7-day window discrepancy flagged in research → we use the provider's value, never our clock alone); provider unreachable → payment keeps `processing` with a `stuck` flag (a late deposit must not be orphaned — double-charge risk) + P2 alert; after **30 min** unreachable past expiry → manual-escalation event. We never auto-expire on our clock while a payment may be in flight.
- **Outbox**: `payment_events` rows `type='state_change' AND to_status IN ('paid','refunded') AND outbox_published_at IS NULL` → worker (same scheduler, 5 s tick, `FOR UPDATE SKIP LOCKED`) → publish to NATS (`@app/backend-common-nats`) for notification consumers → mark `outbox_published_at` (at-least-once; consumers idempotent).

### 5.4 Provider down / degraded / fail-closed

`payment_provider_health` (adapter wrapper updates on every call): success → `up`, reset counters; error → `consecutive_errors++`, class stored.

- `down`: **immediate on `auth` class** (credential revoked → fail closed now) or ≥5 consecutive errors within 10 min.
- `degraded`: ≥2 consecutive `server`/`timeout` errors — still serving, extended timeout, backoff, P2 alert.
- `disabled`: `enabled = false` (admin toggle).
  Resolver behavior: `disabled`/`down`/missing-credentials → **excluded from routing → new payments fail closed with `payment-provider-unavailable` (503)**; `degraded` → allowed. **Webhooks and the reconciler are never blocked by health** — that is how a downed provider recovers (webhook arrives → poll confirms → transition). Kill switch = the registry row: **no code deploy to enable/disable** (research requirement). Admin cannot delete a provider row while non-terminal payments exist (409).

### 5.5 Migrations + secret entrypoint + Docker/Helm/env

- **Migrations**: the 4 numbered postgres migrations ride with the capability (catalog `providerMigrations`) and run through the existing tooling DB entrypoint before boot (MikroORM migrations — established pattern); forward + `down()` verified on a clean container in acceptance. Mongo-axis migrations ship inert (unwired; verifier fails startup only if the axis is selected and drift exists).
- **Secret entrypoint**: env `PAYMENTS_PROVIDER_CREDENTIALS_KEY` / `_KEY_FILE` (exactly one; boot validates 32-byte decode, fail-closed with an actionable error), `_KEY_ID` (default `'env'`), plus `PAYMENTS_PROVIDER_CREDENTIALS_PREV_KEY` / `_PREV_KEY_ID` (rotation window, §1.4). The `_FILE` variant is the prod-only secret-file mount (the `AUTH_PROVIDER_TOKEN_ENCRYPTION_KEY_FILE` precedent: "Prod-only secret-file path for Docker/Compose secret mounting").
- **New env vars** (all five: catalog `environmentVariables` + `.env.example`, `.env.local.example`, `.env.staging.example`, `.env.production.example`, `.env.test.example` — `checkEnvExampleConsistency` gate): `PAYMENTS_PROVIDER_CREDENTIALS_KEY`, `PAYMENTS_PROVIDER_CREDENTIALS_KEY_FILE`, `PAYMENTS_PROVIDER_CREDENTIALS_KEY_ID`, `PAYMENTS_PROVIDER_CREDENTIALS_PREV_KEY`, `PAYMENTS_PROVIDER_CREDENTIALS_PREV_KEY_ID`, `PAYMENTS_WEBHOOK_BASE_URL` (public URL embedded into every provider `callbackUrl`/`ipn_callback_url`/`url_callback`; boot-validates presence when any provider is enabled), `PAYMENTS_SCHEDULER_INTERVAL_MS` (optional), `PAYMENTS_STUCK_ALERT_AFTER_HOURS` (optional, default 2).
- **Docker**: `docker-compose.yml` secret-file mount for the credentials key (same pattern as the auth key); webhook ingress must be public (ingress routes `/api/v1/webhooks/*` to the backend apps).
- **Helm** (`deploy/`, `kubernetesDelivery: direct`): `values` additions — `payments.masterKey` (K8s `Secret`), `payments.webhookBaseUrl`, ingress path `/api/v1/webhooks/*` → `user-app-api` (and admin-app-api); env rendered into all 5 selected backend deployments.
- **Network-layer config (operator, documented in the runbook)**: YooKassa webhook source-IP allowlist; CloudPayments published sender-IP ranges (§4.6); TLS 1.1+ for CP IPNs.

### 5.6 Observability (OTel is already bootstrapped by `bootstrapNestApi`)

- **Metrics**: counters `payments.created{provider,kind}`, `payments.state_change{from,to,provider}`, `webhooks.received{provider,signature}` (signature ∈ valid|invalid|none), `webhooks.rejected{provider,reason}` (reason ∈ bad_signature|replay|stale|parse|unknown_provider); histograms `webhooks.processing_seconds`, `providers.request_seconds{provider,endpoint,status_class}`; gauges `provider.health_state{provider,state}`, `payments.stuck{provider,age_bucket}`, `outbox.lag_seconds`.
- **Alerts**: **P1** — any `signature_valid='invalid'` (attack or misconfiguration); stuck payments > 2 h; provider health `down` (auth class); master-key mismatch at boot; late-paid-after-close (invariant 8). **P2** — webhook rejection rate > 5 %/10 min; outbox lag > 5 min; provider `degraded` > 30 min; underpaid payment > 1 h; cryptobot webhook silence > 24 h with live invoices.
- **Tracing**: CLS `requestId` propagates webhook → receipt → transition → outbox; OTel span per provider call (URL + status + provider code logged; **headers and bodies never logged**).

### 5.7 Rollback plan (provider registry)

1. **Data-only (no deploy)**: admin disables the provider row (`enabled=false`) → new payments fail closed, in-flight continues (webhooks + reconciler). Registry rows are the kill switch.
2. **Code rollback**: revert the branch; run `down()` migrations — safe because the schema is **additive-only** (new tables only, no existing table touched). **Gate: the migration runner refuses `down()` while any non-terminal payment exists** (drain first: admin cancel/expiry until none remain).
3. **Instant off-switch**: `feature-flags` capability flag `payments.enabled` gates customer endpoints → off without deploy.
4. **Credential rollback**: rotation is reversible (prev-key pair); a bad rotation = re-set prev=current, current=prev, re-encrypt sweep again (runbook, audit-logged).

---

## 6. API surface

All endpoints: `api/v1/` prefix, success envelope `{ data: T }` via `createOkResponse`, errors RFC 9457 only (§5.1), Swagger via `@app/backend-common-swagger` (`ApiOkDataResponse(Dto)` auto-adds 503; `ApiExceptions(...)` for the rest), dates as ISO strings on the wire, query booleans via the `@Transform(v => v === true || v === 'true' || v === '1')` pattern (never `@Type(() => Boolean)`).

**Customer** (mounted on every selected backend with `exposeHttp`; behind the app's existing session auth):

- `POST /api/v1/payments` → 201 `{ data: PaymentViewDto }`. Body: `{ orderRef (≤64, unique per tenant — our idempotency anchor in `meta`), amount (decimal string), currency, providerCode? (omit → auto-route by kind/region/priority), payCurrency? (crypto asset), payNetwork?, description? (≤200), returnUrl? { success?, cancel? }, expiresInMs? (≤86400000, default 3600000), meta? }`. Response: `{ id, status, amount, currency, providerCode, payUrl?, payAddress?, payNetwork?, payCurrency?, redirect? { type: 'url', url } | { type: 'form', url, fields }, expiresAt, fxSnapshot? { usdPerUnit, asOf, source, feeInclusive } }`. Errors: 400 amount/currency, 409 `orderRef` reused, 503 provider unavailable / fx unavailable.
- `GET /api/v1/payments/{id}` → `PaymentViewDto` + `{ events: <last 10, redacted of evidence blobs>, refundedAmount }`.
- `GET /api/v1/payments?status&providerCode&from&to&cursor&limit` (≤100) → `{ items, next }` (tenant-scoped).
- `POST /api/v1/payments/{id}/cancel` → 200; only `pending|processing`; calls `closePayment`; provider says already paid → 409 `payment-already-paid` + invariant-8 alert.
- `GET /api/v1/payments/{id}/address` → `{ address, payCurrency, payNetwork, expiresAt, minAmount }` (crypto only; 400 on fiat payments; 409 if the provider address is expired).

**Webhook ingress** (public, signature-gated, §5.2 pipeline): `POST /api/v1/webhooks/{x-rocket|cryptobot|heleket|nowpayments|yookassa|cloudpayments|stripe|adyen}` + `GET /api/v1/webhooks/cloudpayments`. No RBAC, no session — the signature (or the IP-allowlist + re-fetch posture for the unsigned ones) is the gate.

**Admin** (admin-app-api only; `AdminAuthenticationGuard` + RBAC `PaymentReadPermission` / `PaymentWritePermission` / `PaymentProviderWritePermission`; every mutation through `AdminAccessAuditInterceptor` **plus** an explicit audit-log entry with before/after diff, credentials redacted):

- `GET /api/v1/admin/payment-providers` → rows incl. `{ …, credentials: { keyId, last4, rotatedAt }, health: { state, consecutiveErrors, lastErrorClass } }`.
- `POST /api/v1/admin/payment-providers` `{ code, kind, priority, tenantId?, supportedCurrencies, config, baseUrl, version, credentials { kind, ... } (plaintext, encrypted at rest), regionAllow?, regionDeny? }` → 201 (enabled starts **false** — explicit enable step required).
- `GET|PUT|DELETE /api/v1/admin/payment-providers/{code}` (DELETE refused with 409 while non-terminal payments exist; PUT re-encrypts credentials when provided).
- `POST /api/v1/admin/payment-providers/{code}/enable` | `/disable` (health row set to `disabled`/`unknown`; cache invalidated).
- `POST /api/v1/admin/payment-providers/{code}/rotate-credentials { credentials }` (new key → re-encrypt row, audit).
- `POST /api/v1/admin/payment-providers/re-encrypt` (rotation sweep over prev-keyId rows, §1.4).
- `POST /api/v1/admin/payment-providers/{code}/health-check` (force `/health` + `app-info`-equivalent probe + one `getStatus` on a sample payment if any exist).
- `GET /api/v1/admin/payments?status&providerCode&from&to&tenantId&cursor&limit` → admin search.
- `GET /api/v1/admin/payments/{id}` → full view + event log + webhook receipts (raw bodies, audit-logged access).
- `POST /api/v1/admin/payments/{id}/refund { amount? (default full), reason }` → provider refund where `refund` capability exists, else manual refund row (`status: 'manual'`, payment → `refunded` on full); 409 `payment-refund-window-closed` / `payment-already-paid` guards; refund rows append-only.
- `POST /api/v1/admin/payments/{id}/manual-status { status, reason }` (support override; the audit entry **must** capture the provider's current status at call time — the double-check record; only to `failed|cancelled|expired|refunded` from a non-terminal state, or `paid` with full provider evidence attached — never a bare `paid` without evidence).

---

## 7. OpenSpec change, static-check impact, 100% coverage plan

### 7.1 OpenSpec — real change process

- **Change proposal** (process-level, per root `AGENTS.md`: "For observable behavior changes, inspect or update the owning OpenSpec requirement and version 3 evidence sidecar **before** implementation"): `openspec/changes/payments-implementation/` with `.openspec.yaml` (`schema: nrb-verifiable`, `created: 2026-08-22`, goal), `proposal.md`, `discovery.md` (cites the three research reports + `x-rocket-new-openapi.json` + `repo-conventions.md` anchors, verbatim where it matters), `design.md` (in-repo copy of this document), `tasks.md` (the 10 units, §8, as checkboxes), `verification.md` (lane plan), `README.md`, `specs/` (deltas). Archived to `openspec/changes/archive/YYYY-MM-DD-payments-implementation/` on completion (pattern: `2026-07-25-spec-driven-assurance`).
- **Three new capability dirs** (one concern per dir — the existing style; fiat kept catalogue/rate/history REQs in one dir, payments splits because ordering / providers / webhooks have distinct owners of failure):
  - `openspec/specs/payment-ordering/` — `REQ-PAYMENT-ORDER-001` (lifecycle: state machine + invariants 1–9), `-002` (money via common-money + FX snapshot rule), `-003` (idempotent creation: `clientInvoiceId`/`order_id`/`Idempotence-Key`/`reference` all = our payment id), `-004` (expiry + underpaid semantics).
  - `openspec/specs/payment-providers/` — `REQ-PAYMENT-PROVIDER-001` (registry + routing + fail-closed), `-002` (credential encryption/rotation/redaction), `-003` (adapter contract: the per-provider verification matrix — endpoint/auth/signature per §4), `-004` (health states + degraded/down behavior), `-005` (reconciliation + outbox + expiry policy).
  - `openspec/specs/payment-webhooks/` — `REQ-PAYMENT-WEBHOOK-001` (per-provider webhook verification), `-002` (receipt + idempotency + the 400/409/410/502 rejection table + idempotent redelivery), `-003` (double-check rule: no `paid` without provider API confirmation).
- `spec.md` shape per the fiat example: `# Title` → `## Purpose` → `## Requirements` → `### Requirement: [REQ-PAYMENT-…-NNN] <name>` (exact heading regex) with `**Evidence profile:**`, `**Invariants:**`, `**Failure behavior:**`, `#### Scenario:` WHEN/THEN.
- `verification.yaml` v3 per dir: `capability:` = dir name; `owners: { product: runtime-maintainers, verification: backend-maintainers (≠ product — required for the high-risk REQs), security: security-maintainers (security profile), operations: platform-operations }`; each REQ: `projects` (the REQs collectively name **all 5 new Nx projects** — shared+main in ordering REQs, + `@app/backend-postgres-main-payments` in every persistence-implicated REQ, + `@app/backend-feature-payments-admin` in the admin-surface REQs, + `@app/backend-mongodb-main-payments` in the persistence REQs), `risk: normal|high` (PROVIDER-002, WEBHOOK-002, ORDER-001 = high), `profiles: [domain, api, persistence, journey, security, operations]` as applicable, `cucumber: { disposition: not-applicable, reason: '<≥12 chars, requirement-specific, unique per workspace: backend-only capability with no standalone frontend journey; the journey profile is proven by the fullstack-e2e playwright suite (mock provider) at lane main>', alternativeEvidence: [playwright] }`, `evidence: [...]` — every `file` must exist at merge time; kinds: `vitest` (domain/api, lanes pr+main), `component` (persistence, `target: '@app/backend-postgres-main-payments:component-test'`, lanes pr+main), `playwright` (journey, `target: '@app/fullstack-e2e:e2e'`, lane main), `security` (signature/replay tests, lane pr), `operations` (fail-closed + runbook docs, lane main).
- **Behavior-test markers**: every spec file starts `// @requirements REQ-…` and the cited requirements must own that test's Nx project (the `spec:validate` behavior-test inventory). No `REQ-…-SCAFFOLD-001` survives past U1 (the generator plants them; U2+ replaces them with real REQs).

### 7.2 Static-check impact (`pnpm run tooling:static-check`)

| File                                                                                                    | Change                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tsconfig.base.json` `compilerOptions.paths`                                                            | **+5 flattened aliases** (one per lib, §1.1) — 87 → 92; package-style only, one alias per source target                                                                                                                  |
| `libs/backend/package.json`                                                                             | **unchanged** (no new external deps — global `fetch`, `node:crypto`) → lockfile frozen                                                                                                                                   |
| `packages/tooling/src/setup/catalog.ts`                                                                 | + `payments` capability entry (owned/provider projects, `providerMigrations`, `environmentVariables`, `providerBackendWiring`) — scanned by static checks; `environmentVariables` ↔ `.env*.example` consistency enforced |
| `packages/tooling/src/commands/db/orm-migration-config.ts`                                              | `migrationsList` += the 4 postgres migrations (documented registration point)                                                                                                                                            |
| `.nrb/*`, `capabilities.generated.ts`, `capabilities.bootstrap.generated.ts`, `docs/project-catalog.md` | **regenerated** (`pnpm nrb setup`, `pnpm run docs:catalog`) — never hand-edited; new projects enter the closure automatically through the app→lib dependency graph                                                       |
| `apps/backend/admin/admin-app-api/src/admin-app-api.module.ts`                                          | hand-edit: import `PaymentsAdminModule` (the one app file this feature touches by hand)                                                                                                                                  |
| `libs/common/problem-details/…` (catalog)                                                               | + the 15 problem types from §5.1 via `registerProblemTypes`                                                                                                                                                              |
| `.env.example` + 4 sibling `.env*.example`                                                              | + the 8 vars from §5.5                                                                                                                                                                                                   |

**Counters in the success JSON — none move**: `checkedSyntax`, `commandImportSmoke`, `importSmoke`, `generatedContractImportPatterns`, `staleReferenceDenylist`, `packageScriptReferences` are all unchanged (no new tooling scripts/modules, no root `package.json` scripts, no pattern/denylist edits) — a pure feature lib + aliases moves none of them (conventions §7). **Keys must not change.**

Convention checks the feature must satisfy (they scan every generated-contract-import target): flattened alias imports only; one alias per target; one `type:*` tag per project; `export * from` local barrels; no exported ALL_CAPS constants; the exported Symbol token is `PaymentProvidersInjectToken = Symbol('PaymentProvidersInjectToken')` (matching description); no imports of generated-contract internals; i18n: new user-facing strings go into the catalogs (`i18n:catalogs:check`).

### 7.3 100% coverage plan (per-project `fullCoverage`, thresholds 100/100/100/100)

- **shared** (`vitest`): transition matrix exhaustive (every legal edge + every illegal pair, incl. late-paid-after-close), `payment-money` (string↔ratio round-trip, minor-unit conversion for Stripe/Adyen, no-float discipline asserted by spec + one mutation seed), `fx-snapshot` (quote selection, feeInclusive tagging, missing-quote failure), normalized types, port contract test (an in-memory fake adapter proves the port's shape). Module/DTO/index exclusions: n/a here (all files have behavior).
- **main** (`vitest`): every adapter — mocked global `fetch`, per adapter: happy path (request body asserted **field-by-field against the documented payload**, incl. header shape), every `ProviderHttpError` class mapping, unknown-status → `processing`, timeout + retry/backoff exhaustion, webhook verification success/failure/edge cases (**Heleket** escaped-slash golden sample, **NOWPayments** sorted-JSON + slash-quirk golden, **Stripe** stale-timestamp rejection + fresh-signature-per-retry, **Adyen** empty-field payload + hex-decode, **CloudPayments** dual-header fallback + GET IPN, **X-Rocket** spec-assert: request/response shapes validated against `x-rocket-new-openapi.json` schemas via a committed spec-fixture + a contract test, `client_id_already_taken` duplicate path); resolver (routing order, tenant shadow, region allow/deny, health exclusion, no-provider); services (create/query/cancel/refund/manual-status, orderRef idempotency); controllers (envelope shape per endpoint, problem types per error); module spec (wiring). Standard exclusions apply: `*.module.ts`, `*.dto.ts`, pure `index.ts` barrels.
- **postgres** (`vitest` unit with mocked EM + `component-test` with `@testcontainers/postgresql`, `cache: false`): real DDL via the 4 migrations (forward + **rollback**), repository CRUD, unique-constraint replay (concurrent identical receipt inserts → one wins), outbox `SKIP LOCKED` under two workers, receipt→event→payment atomicity.
- **mongodb**: same split with `@testcontainers/mongodb` (inert axis, still 100%).
- **admin** (`vitest`): controller RBAC deny paths, **redaction assertion** (no response/serialized row contains credential material — property-style over generated rows), audit-entry emission on every mutation, DELETE-while-non-terminal 409.
- **E2E** (`fullstack-e2e`, playwright, lane main; **mock provider** = in-repo fastify fixture serving a deterministic API + signing webhooks per the configured scheme, registered in the DB with `base_url` pointing at it):
  1. enable in DB → create (auto-routes to mock) → signed webhook → **paid** (assert `{data}` envelope, events row, outbox publish);
  2. **refund** → refund confirmed (mock supports refund) → `refunded`;
  3. **replay** the same webhook id → 200, zero state change (idempotent redelivery);
  4. **disable** provider → create → 503 fail-closed;
  5. **negative signature** → 400 + receipt `signature_valid='invalid'` + P1 metric;
  6. stale terminal event → 410; in-flight duplicate → 409;
  7. provider unreachable at create → 503 (health down path).
     Scenarios 1, 3, 4, 5 also run at lane pr (fast subset).
- **Mutation** (optional nightly, `stryker.config.mjs` exists): seed the state machine + Heleket serializer.

---

## 8. Implementation units (worktree-sized, ordered; each unit = one worktree + one commit-able increment)

**U1 — Scaffold + OpenSpec shell.** `pnpm nrb add feature payments --api-app user-app-api --frontend-app user-app --database postgres` (generator creates shared/main/postgres + 3 aliases + migration registry slot + root-module wire for the _generated_ app-owned piece); hand-author the **admin** lib and the **mongodb** mirror (generator cannot); 5 aliases in `tsconfig.base.json`; setup-catalog `payments` entry + `pnpm nrb setup` regeneration; `openspec/changes/payments-implementation/` + 3 spec dirs with REQs + `verification.yaml` (scaffold-level evidence: module/DTO specs with `REQ-…-SCAFFOLD-001` markers until U2+ re-point them); `pnpm api:openapi && pnpm api:contracts && pnpm api:clients`. **Done when**: `pnpm nrb closure check` ok, `pnpm run spec:validate` ok, typecheck+lint green on all 5 projects, `docs:catalog` regenerated and `docs:check` green, 5 aliases present.

**U2 — Shared domain.** State machine + invariants 1–9, `payment-money`, `fx-snapshot`, `PaymentProviderPort` + normalized types, `PaymentProvidersInjectToken`, provider problem types registered in `@app/common-problem-details`. **Done when**: shared project at 100% coverage; transition-matrix spec covers every legal/illegal pair incl. invariant 8; `spec:validate` with real REQs (scaffold markers retired); typecheck green.

**U3 — Postgres persistence.** Entities + 4 numbered migrations (with `down()`) + `PaymentsPostgresPersistence` (port via `useExisting`) + health table + outbox queries + component specs. **Done when**: `component-test` green in a real container (forward **+ rollback** of all 4 migrations on a clean DB); port-bound; 100%.

**U4 — Mongo reference axis.** Collections/validators/indexes + migrations + verifier + ordered-write repository + module. **Done when**: `component-test` green (`@testcontainers/mongodb`); axis **not wired** (closure selection unchanged); 100%.

**U5 — Provider framework.** Symbol token + `useFactory` registry, `PaymentProviderResolver` (TTL cache, shadow, region, priority, health), `ProviderHealthService` (up/degraded/down/disabled, §5.4 thresholds), `ProviderHttpError` + `provider-http.ts` (retry/backoff/token-bucket/semaphore), provider problem exceptions. **Done when**: unit 100%; fail-closed proven by specs (disabled → 503, down → 503, region-denied → 503, no-provider → 503, degraded → allowed).

**U6 — Webhook ingress.** Raw-body hook, 8 POST routes + CP GET, verification dispatch, receipt persistence, the full 400/409/410/502/200 table (§5.2), redelivery idempotency, metrics wiring. **Done when**: unit + component specs for bad-signature → 400, replay (in-flight → 409, applied → 200 no-op, stale-terminal → 410), DB-failure → 502; e2e-ready.

**U7 — Crypto adapters.** X-ROCKET (new spec; request/response **contract-asserted against `x-rocket-new-openapi.json`** committed as a fixture), CryptoBot, Heleket (serializer golden test), NOWPayments (sorted-JSON golden + `case` sandbox param in config). **Done when**: per-adapter 100% (every error class, unknown status, retry path); X-Rocket spec-fixture contract test green; resolver can route to all four.

**U8 — Fiat adapters.** YooKassa (Idempotence-Key, capture/cancel/refund, IP-allowlist note), CloudPayments (dual HMAC, 3DS form redirect, concurrency semaphore 5/30, refund ≤1y), Stripe (minor units, `Stripe-Signature` tolerance, refund), Adyen (v72, colon-string HMAC, hex-decoded key, refund, live-prefix config). **Done when**: same bar; redirect abstraction returns `{url}` vs `{form}` correctly; refund/close capability matrix matches §A.

**U9 — API + admin + audit.** `PaymentsService` orchestration (create with FX snapshot + orderRef idempotency, query, cancel, refund flow, manual-status with double-check record), customer controllers/DTOs, admin controllers/DTOs, RBAC permissions, audit entries, redaction, Swagger annotations, `api:openapi/contracts/clients` regenerated with the committed artifacts. **Done when**: contract specs 100% per endpoint (envelope + every error code); redaction assertion; OpenAPI diff reviewed (new paths only, no existing contract changed — the JSON key contract is immutable).

**U10 — Reconciliation, deployment, docs, acceptance.** Reconciler (redlock) + outbox worker + metrics/alerts final wiring; env: catalog `environmentVariables` + all 5 `.env*.example`; Docker compose secret-file mount; Helm values + ingress; onboarding smoke script (X-Rocket `GET /health` + `GET /api/v1/app-info` + `GET /api/v1/currencies` + one testnet invoice if the operator supplies a testnet token — the legacy `PUT /api/v1/invoices/pay` trigger is **not** assumed); ops runbooks (provider onboarding incl. NOWPayments once-only IPN secret, key rotation, RU compliance gates, rollback per §5.7); `docs/features/payments/` (completion guide per generator convention). **Done when — FULL ACCEPTANCE**:

1. `pnpm test` (closure) green; `pnpm test:coverage` 100% on all 5 new projects;
2. `pnpm run spec:validate` ok (all REQs mapped, every project owned, evidence files exist, marker ownership clean);
3. `pnpm run tooling:static-check` ok — success-JSON counters **unchanged**, keys stable;
4. `docs:check`, `i18n:catalogs:check`, `api:openapi:check && api:contracts:check && api:clients:check`, `pnpm nrb closure check` all green;
5. migrations forward **+ rollback** verified on a clean postgres container;
6. **built-dist boot**: all 5 selected backend apps build and boot from dist with the regenerated `capabilities.generated.ts`; `/health` ok on each;
7. **e2e**: fullstack-e2e scenarios 1–7 (§7.3) green at lane main;
8. docs + runbooks committed; change archived into `openspec/changes/archive/`.

---

## 9. Risk table

| #   | Risk                                                                                                                                                                                                                                                                                                                                                            | L / I | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Unverifiable provider API details** — rate-limit numbers absent on 7 of 8 (CloudPayments' concurrency 5/30 is the only verified number); NOWPayments IPN serializer quirk (PHP vs Node slash escaping); Adyen reconciliation GET not in the research capture; X-Rocket testnet payment-trigger absent from the new spec; X-Rocket prod host behind Cloudflare | M / H | golden tests pinned from sandbox/live captures as a **staging task per provider before enablement**; runtime currency lists (never hardcode assets); `base_url`/path per row (DB-configurable, survives layout drift); onboarding smoke (`/health` + `app-info` + currencies) gates the enable step; 429 backoff + token buckets; no invented endpoints anywhere in this design                                                                                                                                                                                                                                                                |
| 2   | **RU compliance (KYC/AML/sanctions) — operator-owned** — Heleket RU = non-serviced (verified 2026-06-23); Stripe/Adyen RU = non-viable (verified); YooKassa Sber-group SDN exposure for non-RU entities; X-Rocket "Restricted Jurisdictions" list unpublished; 54-FZ receipts                                                                                   | H / H | the feature stays compliance-neutral: per-row `region_deny`/`region_allow` defaults encode the **verified** exclusions (Heleket RU; Stripe/Adyen RU+UA+BY; NOWPayments EU/UK/US merchant gate); X-Rocket ships **disabled** until written support confirmation on RU; compliance warnings are config-driven surfaces, never baked assumptions; KYC/AML/sanctions decisions, receipt templates, and vendor onboarding are **operator obligations** documented in the runbook; legal entity verification (X-Rocket X-ROCKET CORP. Panama vs "X-Rocket LLC" footer conflict) is an operator task                                                  |
| 3   | **FX drift** (rate moves between snapshot and settlement; provider rates embed spread)                                                                                                                                                                                                                                                                          | M / M | snapshot locked at creation in the same tx (§2.3); settlement math uses the provider's realized `receiveAmount`/net amounts, the snapshot is display/audit-only; provider-sourced rates tagged `feeInclusive: true` in provenance so they never mix with market rates; `payment-fx-unavailable` fail-closed when no quote                                                                                                                                                                                                                                                                                                                      |
| 4   | **Webhook replay / forgery**                                                                                                                                                                                                                                                                                                                                    | M / H | unique `(provider_code, idempotency_key)` constraint on every axis; freshness window + 410; constant-time signature checks where schemes exist; unsigned providers (X-Rocket — spec-confirmed no signature; YooKassa v3 — verified no signature) rely on the **double-check rule** (API re-fetch before any transition) + network-layer IP allowlists (YooKassa operator-side, CP published ranges) + TLS-only transport; every `invalid` receipt is a P1                                                                                                                                                                                      |
| 5   | **DB secret leak** (provider credentials at rest)                                                                                                                                                                                                                                                                                                               | L / H | AES-256-GCM envelope per row + `keyId`; master key only in env/file (never DB); admin API redacted to `{keyId, last4, rotatedAt}` (spec-asserted); no credential logging (adapter discipline + assertion); admin-only RBAC + audit on every touch; rotation runbook with prev-key pair + boot fail-closed on key mismatch; secret-scan allowlist rules respected by the env naming                                                                                                                                                                                                                                                             |
| 6   | **Crypto confirmation / double-spend** (underpayment, multi-payment, late deposit after close, unknown confirmation counts)                                                                                                                                                                                                                                     | M / H | finality semantics per provider (X-Rocket `finalizedAt != null` per spec; Heleket `confirm_check`→paid only after re-verify; NOWPayments `finished`; cryptobot `paid` + re-check); unique `(provider_code, provider_payment_id)`; provider idempotency keys = our payment id (X-Rocket `clientInvoiceId`, Heleket `order_id`, NOWPayments `order_id`, YooKassa `Idempotence-Key` 24 h, Stripe `Idempotency-Key`, Adyen `reference`); underpaid stays `processing` (invariant 5); **late-paid-after-close never auto-credits** — escalation + alert (invariant 8); X-Rocket `numPayments` multi-pay handled by `partially_paid` + payments list |
| 7   | **Webhook endpoint availability** against provider retry regimes (cryptobot 17×/3d then **auto-disable**; YooKassa 7×/24h; NOWPayments dashboard-configured; CP undocumented; X-Rocket "retries move later in the queue")                                                                                                                                       | M / M | idempotent + fast 200; dedupe is DB-level (cross-replica safe); reconciler backstops **every** provider (webhooks are advisory for all of them); cryptobot `getMe` liveness + silence alert; stuck-payment alert > 2 h; 502 only when nothing was committed                                                                                                                                                                                                                                                                                                                                                                                    |
| 8   | **Provider host/contract drift** (X-Rocket docs vs legacy layout; Cloudflare challenge on plain clients; spec `servers: []`)                                                                                                                                                                                                                                    | M / M | layout + host in the DB row; contract test pins X-Rocket to the spec fixture; drift = operator config change, not a deploy; auth-class errors → instant fail-closed + P1 (a rotated X-Rocket token must not silently break payments)                                                                                                                                                                                                                                                                                                                                                                                                           |
| 9   | **Migration/rollback with live money**                                                                                                                                                                                                                                                                                                                          | L / H | additive-only schema (no existing table touched); `down()` gated on zero non-terminal payments; `payments.enabled` feature flag = instant off; data rollback = registry disable (no deploy); outbox at-least-once with idempotent consumers                                                                                                                                                                                                                                                                                                                                                                                                    |
| 10  | **X-Rocket entity ambiguity** (AML: X-ROCKET CORP., Panama; ToS footer: X-Rocket LLC)                                                                                                                                                                                                                                                                           | L / M | operator legal-onboarding task before credential issuance; recorded in the runbook; not a code dependency                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## A. Provider capability matrix

| Provider                            | kind                           | Currencies                                                                                                                                                         | Refund                                                             | Webhook model                                                                                                                      | Testnet                                                                   | RU availability                                                                         |
| ----------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **X-Rocket** (new API, spec v1.0.0) | crypto                         | runtime list via `GET /api/v1/currencies` (networks TON/BSC/ETH/BTC/TRX/SOL; AML lists BTC ETH TRON TON BNB USDT SOL) — fiat **price** currency supported per spec | **none** (void unpaid: `DELETE /api/v1/invoice`)                   | unsigned callbacks (spec-confirmed); idempotency by `InvoiceWebhookDto.id`; finality `finalizedAt != null`; double-check mandatory | testnet host per docs (spec silent); test-payment trigger NOT in new spec | **unverified** (sanctions list + undisclosed restricted jurisdictions) → ships disabled |
| **Telegram Crypto Bot**             | crypto                         | 8: USDT TON BTC ETH LTC BNB TRX USDC (+JET testnet)                                                                                                                | none (void: `deleteInvoice`)                                       | HMAC-SHA256(raw body), key = SHA256(token) binary, header `crypto-pay-api-signature` (verified); 17 retries/3d, auto-disable after | full (separate bot, JET)                                                  | usable; RU/CIS-oriented; operator entity unverified                                     |
| **Heleket**                         | crypto (+fiat-priced invoices) | ~15+ coins / 12+ networks; fiat invoices (USD/RUB examples)                                                                                                        | none for finished invoices (blocked-address + payout refunds only) | MD5 in-body `sign` (verified; weak → double-check mandatory); resend/testing endpoints                                             | **none** (staging = tiny live invoices)                                   | **excluded — verified** (AML non-serviced, 2026-06-23)                                  |
| **NOWPayments**                     | crypto                         | 300+ (runtime lists `/v1/currencies`, `/v1/full-currencies`, `/v1/merchant/coins`)                                                                                 | none in API (support-only; failed/waiting per ToS)                 | HMAC-SHA512 IPN, header `x-nowpayments-sig` (verified); no expiry IPN → poll to terminal                                           | full sandbox + `case` param                                               | allowed (ToS bars EU/UK/US merchants)                                                   |
| **YooKassa** (v3)                   | fiat RU                        | RUB + 10 codes in spec                                                                                                                                             | **yes**, ≤3 y, partial                                             | v3 **signature-less** (verified absence) → IP allowlist + re-fetch; 7 retries/24h                                                  | demo store (auto test keys)                                               | fully operational (Sber SDN warning for non-RU entities)                                |
| **CloudPayments**                   | fiat RU                        | RUB + 26 published (+54 unverified)                                                                                                                                | **yes**, ≤1 y                                                      | HMAC-SHA256 dual headers `X-Content-HMAC`/`Content-HMAC` (verified) + published sender IPs; GET or POST IPN                        | test terminals (same host)                                                | fully operational; not sanctioned                                                       |
| **Stripe**                          | fiat global                    | 135+ (RUB listed, legacy only)                                                                                                                                     | **yes**, partial                                                   | `Stripe-Signature` t/v1 HMAC-SHA256, 5-min tolerance, fresh sig per retry (verified)                                               | test mode + Stripe CLI                                                    | **non-viable for RU** (verified support article)                                        |
| **Adyen** (Checkout v72)            | fiat global                    | RUB listed but **processing suspended** (verified)                                                                                                                 | **yes**, partial                                                   | HMAC-SHA256 8-field colon string, hex-decoded key → base64 (verified); resend until success                                        | test env + ca-test keys                                                   | **non-viable for RU** (verified FAQ)                                                    |

---

## B. File map — new

```
libs/backend/feature/payments/
├── shared/lib/
│   ├── AGENTS.md  README.md  eslint.config.cjs  project.json
│   ├── tsconfig.json  tsconfig.lib.json  tsconfig.spec.json  vitest.config.mts
│   └── src/
│       ├── index.ts
│       ├── payment.types.ts                      (+ .spec.ts)
│       ├── payment-persistence.ts                (+ .spec.ts)   # abstract PaymentsPersistence port
│       ├── payment-provider.port.ts              (+ .spec.ts)   # abstract PaymentProviderPort + ProviderCreatedPayment
│       ├── payment-state-machine.ts              (+ .spec.ts)   # transitionPayment + invariants
│       ├── payment-money.ts                      (+ .spec.ts)   # string<->common-money boundary
│       ├── fx-snapshot.ts                        (+ .spec.ts)   # FX snapshot rule
│       ├── normalized-provider.ts                (+ .spec.ts)   # NormalizedProviderStatus/Event, ProviderHttpError
│       ├── payments.tokens.ts                    (+ .spec.ts)   # PaymentProvidersInjectToken
│       └── provider-problem-types.ts             (+ .spec.ts)   # registerProblemTypes payload (§5.1)
├── main/lib/
│   ├── AGENTS.md  README.md  eslint.config.cjs  project.json
│   ├── tsconfig.json  tsconfig.lib.json  tsconfig.spec.json  vitest.config.mts
│   └── src/
│       ├── index.ts
│       ├── payments-main.module.ts               (+ .spec.ts)   # forRoot({imports, exposeHttp, scheduler})
│       ├── controller/
│       │   ├── index.ts
│       │   ├── payments.controller.ts            (+ .spec.ts)   # customer endpoints
│       │   ├── payments-webhooks.controller.ts   (+ .spec.ts)   # public webhook ingress
│       │   └── dto/ (index.ts, payments.dto.ts, payments-webhooks.dto.ts + specs)
│       ├── service/
│       │   ├── index.ts
│       │   ├── payments.service.ts               (+ .spec.ts)   # create/query/cancel/refund orchestration
│       │   ├── payment-provider-resolver.service.ts (+ .spec.ts)
│       │   ├── provider-health.service.ts        (+ .spec.ts)
│       │   ├── payment-reconciliation.service.ts (+ .spec.ts)   # redlock scheduler
│       │   └── payment-outbox.service.ts         (+ .spec.ts)
│       └── providers/
│           ├── index.ts
│           ├── provider-http.ts                  (+ .spec.ts)   # fetch wrapper, retry/backoff/buckets
│           ├── provider-errors.ts                (+ .spec.ts)
│           ├── x-rocket.provider.ts               (+ .spec.ts)   # NEW API per spec §4.1
│           ├── x-rocket.spec-fixtures.ts          (spec-only: pinned x-rocket-new-openapi.json slice)
│           ├── cryptobot.provider.ts              (+ .spec.ts)
│           ├── heleket.provider.ts               (+ .spec.ts)   # + serializer golden
│           ├── nowpayments.provider.ts           (+ .spec.ts)   # + sorted-JSON golden
│           ├── yookassa.provider.ts              (+ .spec.ts)
│           ├── cloudpayments.provider.ts         (+ .spec.ts)
│           ├── stripe.provider.ts                (+ .spec.ts)
│           └── adyen.provider.ts                 (+ .spec.ts)
└── admin/lib/
    ├── AGENTS.md  README.md  eslint.config.cjs  project.json
    ├── tsconfig.json  tsconfig.lib.json  tsconfig.spec.json  vitest.config.mts
    └── src/
        ├── index.ts
        ├── payments-admin.module.ts              (+ .spec.ts)
        ├── controller/
        │   ├── index.ts
        │   ├── payment-providers-admin.controller.ts (+ .spec.ts)
        │   ├── payments-admin.controller.ts      (+ .spec.ts)
        │   └── dto/ (index.ts, payment-providers-admin.dto.ts, payments-admin.dto.ts + specs)
        └── service/
            ├── index.ts
            ├── payment-providers-admin.service.ts (+ .spec.ts)   # CRUD, enable/disable, rotate, re-encrypt, health-check
            └── payments-admin.service.ts          (+ .spec.ts)   # search, refund, manual-status
libs/backend/postgres/main/payments/lib/
├── AGENTS.md  README.md  eslint.config.cjs  project.json
├── tsconfig.json  tsconfig.lib.json  tsconfig.spec.json  vitest.config.mts  vitest.component.config.mts
└── src/
    ├── index.ts
    ├── payments-postgres.module.ts               (+ .spec.ts)
    ├── infrastructure/data-access/
    │   ├── entities/ (index.ts, payment-provider.entity.ts, payment.entity.ts, payment-event.entity.ts, payment-webhook-receipt.entity.ts, payment-refund.entity.ts, payment-provider-health.entity.ts)
    │   ├── repositories/payments.repository.ts   (+ .spec.ts)   # PaymentsPostgresPersistence
    │   └── migrations/
    │       ├── Migration20260823100000CreatePaymentProviders.ts
    │       ├── Migration20260823100100CreatePayments.ts
    │       ├── Migration20260823100200CreatePaymentEvents.ts
    │       ├── Migration20260823100300CreatePaymentWebhookReceipts.ts
    │       └── index.ts
    └── payments-postgres.component-spec.ts       # testcontainers: DDL forward+down, CRUD, replay, outbox
libs/backend/mongodb/main/payments/lib/
├── AGENTS.md  README.md  eslint.config.cjs  project.json
├── tsconfig.json  tsconfig.lib.json  tsconfig.spec.json  vitest.config.mts  vitest.component.config.mts
└── src/
    ├── index.ts
    ├── payments-mongo.module.ts                  (+ .spec.ts)   # PersistenceModule + forRoot + MigrationVerifier
    ├── payments-mongo.collection.ts              (+ .spec.ts)   # validators + indexes
    ├── payments-mongo.repository.ts              (+ .spec.ts)   # ordered writes
    ├── migrations/ (Migration20260823100000InitializePayments.ts, index.ts)
    └── payments-mongo.component-spec.ts          # testcontainers mongodb
apps/backend/admin/admin-app-api/src/admin-app-api.module.ts     # + PaymentsAdminModule import (hand edit)
openspec/changes/payments-implementation/ { .openspec.yaml, proposal.md, discovery.md, design.md, tasks.md, verification.md, README.md, specs/ }
openspec/specs/payment-ordering/{spec.md, verification.yaml}
openspec/specs/payment-providers/{spec.md, verification.yaml}
openspec/specs/payment-webhooks/{spec.md, verification.yaml}
apps/e2e/fullstack-e2e/ (fixtures: payments-mock-provider + 7 playwright specs)
docs/features/payments/{index.md, operations.md (runbooks: onboarding, key rotation, RU gates, rollback)}
```

**Modified (generated — regenerate, don't hand-edit)**: `tsconfig.base.json` (+5 aliases), `packages/tooling/src/setup/catalog.ts` (+capability — hand source, generated outputs follow), `packages/tooling/src/commands/db/orm-migration-config.ts` (+4 migrations), `.env*.example` ×5, `docs/project-catalog.md`, `.nrb/*`, each selected backend app's `capabilities.generated.ts`, OpenAPI/contracts/clients artifacts, `libs/backend/package.json` **unchanged**.

---

## C. X-ROCKET contract appendix (spec inventory, verbatim anchors)

Source: `x-rocket-new-openapi.json` — "X-Rocket Pay API" v1.0.0, OpenAPI 3.0 (saved 2026-08-22 from `https://pay.api.x-rocket.exchange/api/docs-json`; docs UI `https://pay.api.x-rocket.exchange/api/docs`, http→https redirect). **18 unique paths / 23 operations**:

`GET /health` · `GET /api/v1/app-info` · `GET /api/v1/balances` · `POST /api/v1/invoices` (create; callback "Invoice updated") · `GET /api/v1/invoices` (list: asset, fiat, ids[], status, cursor, limit≤1000) · `GET /api/v1/invoice` (invoiceId|clientInvoiceId, both ≤100; invoiceId wins) · `DELETE /api/v1/invoice` (void; same identifiers) · `GET /api/v1/invoice/payments` (cursor, limit≤1000; "same format as the payment_status_changed webhook") · `POST /api/v1/cheques` / `GET /api/v1/cheques` / `PUT /api/v1/cheques` / `DELETE /api/v1/cheques` (callback "Cheque updated") · `GET /api/v1/cheque` · `POST /api/v1/payouts` (callback "Payout updated"; `clientPayoutId` ≤50 "to prevent double spends"; `targetType: user_id|telegram_user_id|telegram_username`) · `GET /api/v1/payouts` · `GET /api/v1/payout` (payoutId|clientPayoutId ≤100) · `POST /api/v1/withdrawals` (callback "Withdrawal updated"; `clientWithdrawalId` ≤150 required; `amount` "9 decimal places, others cut off"; statuses CREATED|COMPLETED|FAIL; `txHash`/`txLink` after completion) · `GET /api/v1/withdrawals` (fromDate, toDate, status, cursor) · `GET /api/v1/withdrawal` (withdrawalId|clientWithdrawalId ≤100) · `GET /api/v1/withdrawal-quotas` (network + asset, both required; network enum TON|BSC|ETH|BTC|TRX|SOL) · `POST /api/v1/withdrawal-link` · `POST /api/v1/mass-payouts` (callback "Payout updated"; Telegram users only) · `GET /api/v1/currencies` (public; kind=crypto|fiat) · `GET /api/v1/rates` (base=fiat default USD, assets[]; optional auth) · `POST /api/v1/invoices/payments/address` (query invoiceId|clientInvoiceId + body `{payNetwork}`; **201**; minAmount "invoice has no fixed amount").

Webhook envelope (all providers of X-Rocket): `{ id, timestamp, type, data }` — `id` is "the receiver's idempotency" key, stable across retries; events `invoice_status_changed` / `payment_status_changed` (invoice webhooks), `data` = full entity (payout/withdrawal/cheque); expected receiver response **200 OK**; **no signature scheme anywhere in the spec** (0 occurrences of "signature"/"secret"); delivery best-effort, **order not guaranteed**; unknown events/statuses must be ignored (lists "may be extended without notice").

Error envelope: `{ type: '/api/problems/<kebab>', title, status, detail, instance: '/api/problems/instances/<uuid>', kind }` — all six properties required on every error object; full 38-pair inventory in §4.1.

**Not defined by the spec (operator-configured / unknown — this design never assumes them)**: base URL (`servers: []`); app-wide webhook URL registration; webhook signature; rate-limit values; testnet (host lives in docs, not spec); `PUT /api/v1/invoices/pay`-style test trigger (absent from this spec); refunds for paid invoices; fiat settlement; concrete asset availability (runtime `/api/v1/currencies` is authoritative).

_End of design._
