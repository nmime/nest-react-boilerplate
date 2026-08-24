## Why

The product needs to accept crypto and fiat payments through eight verified
providers (X-Rocket, CryptoBot, Heleket, NOWPayments, YooKassa, CloudPayments,
Stripe, Adyen) without a code deploy to add, disable, or rotate a provider,
and without a single unsigned or un-rechecked webhook being able to credit a
payment. The repository has no payments capability: no ordering lifecycle, no
provider registry, no webhook receipt wall, no credential envelope.

## What Changes

- Add five Nx projects: `@app/backend-feature-payments-shared`,
  `@app/backend-feature-payments-main`, `@app/backend-feature-payments-admin`,
  `@app/backend-postgres-main-payments`, `@app/backend-mongodb-main-payments`
  (postgres is the wired axis; mongodb ships as an inert reference axis).
- Add a setup capability `payments` and wire it into the five selected
  backends (customer + webhook HTTP uniformly; admin surface on
  admin-app-api only).
- Add a 7-state payment lifecycle with a single pure transition function and
  nine enforced invariants, exact-ratio money through `@app/common-money`,
  and an immutable FX snapshot written at creation.
- Add the provider registry (routing, tenant shadow, region policy, health)
  with fail-closed 503 semantics and envelope-encrypted DB credentials
  (AES-256-GCM, key rotation, admin redaction).
- Add one `PaymentProviderPort` with eight adapters conformed to each
  provider's documented endpoints, auth, and signature scheme — including
  X-Rocket verified against its new OpenAPI spec (no signature scheme:
  double-check is mandatory).
- Add public webhook ingress with raw-body signature verification, a
  receipt-first unique-index idempotency wall, the 400/409/410/502 rejection
  table, and the universal double-check rule (no `paid` on a webhook body
  alone).
- Add reconciliation (Redis-redlocked poller), a NATS outbox, and expiry
  policy; 15 new problem+json types registered in
  `@app/common-problem-details`.
- Add the admin provider/payment surface (CRUD, enable/disable, credential
  rotation and re-encryption sweep, health-check, refund, manual-status)
  with RBAC permissions and audit-logged mutations.

No new external dependencies: global `fetch`, `node:crypto`, the already
hoisted `@mikroorm/*` and `mongodb`. The lockfile does not move.

## Capabilities

### New Capabilities

- `payment-ordering`: the payment lifecycle, exact money + FX snapshot,
  idempotent creation, and expiry/underpaid semantics.
- `payment-providers`: the provider registry and routing, credential
  encryption/rotation/redaction, the adapter contract, health states, and
  reconciliation/outbox/expiry policy.
- `payment-webhooks`: per-provider webhook verification, receipt-first
  idempotency and the rejection table, and the double-check rule.

### Modified Capabilities

- None. The capability is additive; `fiat-currency-catalog` is read (rate
  history quotes) but not modified.

## Impact

- New: the five payments projects, their specs and verification sidecars,
  the `payments` setup-catalog entry, the `payments-implementation` change
  and its three delta specs, 4 postgres migrations (additive-only) + the
  inert mongo initializer, 8 env vars across the catalog and all five
  `.env*.example` files, and regenerated OpenAPI/contract/client artifacts
  and `docs/project-catalog.md`.
- Modified (generated or app-owned, per design): `tsconfig.base.json`
  (+5 aliases), the five selected backends' generated
  `capabilities.generated.ts`, `admin-app-api.module.ts` (hand import of
  `PaymentsAdminModule`), `orm-migration-config.ts` (+4 migrations),
  `@app/common-problem-details` registrations, `.nrb/*` closure artifacts.
- Unchanged: `libs/backend/package.json` and the pnpm lockfile.
- Rollback: registry rows are the kill switch (disable, no deploy); code
  rollback runs `down()` migrations, which are additive-only and gated while
  non-terminal payments exist.

## Risk, Rollout, and Rollback

Risk is high: the feature handles real money across eight external
contracts, one of which (X-Rocket) was just re-specified, and three fiat
webhook schemes must be byte-exact. Rollout is incremental by unit (U1
scaffold + OpenSpec shell → U2 shared domain → U3 postgres → U4 mongo →
U5 provider framework → U6 webhook ingress → U7/U8 adapters → U9 API/admin →
U10 e2e + runbooks), each gated by `spec:validate`, closure, static-check,
typecheck/lint, and per-project 100% coverage. Rollback is
`design.md` §5.7: data-only disable first, additive-only migration
`down()` second, feature-flag off-switch third.
