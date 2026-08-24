## 1. Scaffold + OpenSpec shell (U1)

- [x] 1.1 U1a: generate the five payments projects (`nrb add feature`
      shared/main/postgres + hand-authored admin and mongodb mirror), 5
      flattened aliases in `tsconfig.base.json`, scaffold suites tracing to
      a single scaffold requirement, setup-catalog `payments` entry.
- [x] 1.2 U1b: `pnpm nrb setup` regeneration for the five selected backends
      (`capabilities.generated.ts`), `PaymentsAdminModule` hand-imported in
      admin-app-api only, scope matrix entry, capability-wiring spec.
- [x] 1.3 U1c: this change proposal + the three capability spec dirs with
      the 12 requirements and v3 verification sidecars (scaffold-level
      evidence re-pointed from the retired scaffold requirement),
      `api:openapi/contracts/clients` + `docs:catalog` regenerated.

## 2. Shared domain (U2)

- [ ] 2.1 State machine + invariants 1–9 (`payment-state-machine.ts`,
      transition-matrix spec covering every legal/illegal pair).
- [ ] 2.2 `payment-money.ts` string↔ratio boundary (no-float discipline).
- [ ] 2.3 `fx-snapshot.ts` quote selection, feeInclusive tagging,
      missing-quote failure.
- [ ] 2.4 `PaymentProviderPort` + normalized status/error types +
      `PaymentProvidersInjectToken`.
- [ ] 2.5 Register the 15 payments problem types in
      `@app/common-problem-details`.
- [ ] 2.6 Retire scaffold evidence in the sidecars; shared at 100%.

## 3. Postgres persistence (U3)

- [ ] 3.1 Entities + the 4 numbered migrations with `down()`.
- [ ] 3.2 `PaymentsPostgresPersistence` bound to the shared port via
      `useExisting`; health table + outbox queries.
- [ ] 3.3 Component specs: forward + rollback on a clean container,
      unique-constraint replay, outbox `SKIP LOCKED`, atomicity.

## 4. Mongo reference axis (U4)

- [ ] 4.1 Collections, validators, indexes (receipt unique index).
- [ ] 4.2 Ordered-write repository (receipt → event → payment) + verifier +
      `forRoot`; axis left unwired.
- [ ] 4.3 Component specs (`@testcontainers/mongodb`); 100%.

## 5. Provider framework (U5)

- [ ] 5.1 Symbol-token `useFactory` registry + `PaymentProviderResolver`
      (TTL cache, shadow, region, priority, health exclusion).
- [ ] 5.2 `ProviderHealthService` (up/degraded/down/disabled, §5.4
      thresholds).
- [ ] 5.3 `ProviderHttpError` + `provider-http.ts` (retry/backoff/token
      bucket/semaphore) + provider problem exceptions.
- [ ] 5.4 Fail-closed proven: disabled → 503, down → 503, region-denied →
      503, no-provider → 503, degraded → allowed.

## 6. Webhook ingress (U6)

- [ ] 6.1 Raw-body hook, 8 POST routes + CP GET, verification dispatch.
- [ ] 6.2 Receipt persistence + the 400/409/410/502/200 table + redelivery
      idempotency.
- [ ] 6.3 Metrics wiring; bad-signature → 400, replay → 409, stale-terminal
      → 410, DB-failure → 502 proven by specs.

## 7. Crypto adapters (U7)

- [ ] 7.1 X-Rocket against the committed `x-rocket-new-openapi.json` fixture
      (contract-asserted), CryptoBot, Heleket (serializer golden test),
      NOWPayments (sorted-JSON golden + `case` sandbox param).
- [ ] 7.2 Every error class, unknown status, and retry path at 100%;
      resolver routes to all four.

## 8. Fiat adapters (U8)

- [ ] 8.1 YooKassa, CloudPayments, Stripe (minor units, signature
      tolerance), Adyen (v72 colon-string HMAC, hex-decoded key).
- [ ] 8.2 Refund/close capability matrix matches §A; redirect abstraction
      returns `{url}` vs `{form}` correctly.

## 9. API + admin + audit (U9)

- [ ] 9.1 `PaymentsService` orchestration (create with FX snapshot +
      orderRef idempotency, query, cancel, refund, manual-status with
      double-check record).
- [ ] 9.2 Customer + admin controllers/DTOs, RBAC permissions, audit
      entries, redaction, Swagger annotations.
- [ ] 9.3 `api:openapi/contracts/clients` regenerated; contract specs 100%
      per endpoint; OpenAPI diff = new paths only.

## 10. Reconciliation, deployment, docs, acceptance (U10)

- [ ] 10.1 Reconciler (Redis redlock) + outbox worker + metrics/alerts
      final wiring.
- [ ] 10.2 Env: catalog `environmentVariables` + all 5 `.env*.example`;
      Docker secret-file mount; Helm values + ingress.
- [ ] 10.3 Onboarding smoke script + ops runbooks (onboarding, key
      rotation, RU gates, rollback §5.7) + `docs/features/payments/`.
- [ ] 10.4 Full acceptance (design §8 U10 done-when 1–8) and archive this
      change into `openspec/changes/archive/`.
