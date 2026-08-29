# Tenant and Currency Audit

Date: 2026-08-29

Branch: `tenant-currency-audit`

Audit baseline: `bc96c43ce46ae68e8624d60a6a0ce6c2cd699baa`

## Executive disposition

All P0/P1 findings in the requested tenant/currency scope are resolved in this branch.

- Tenant ownership is explicit: strictly tenant-owned tables and the notification shared tier are inventoried separately. Runtime isolation remains repository-predicate based; the inventory also protects migration coverage (`libs/backend/common/tenant-policy/lib/src/tenant-policy.ts:48-99`).
- User-action and link-token redemption no longer trusts a caller-selected/default tenant. Ownership is derived from a globally unique persisted token; an explicitly trusted tenant remains only an optional rejection filter at the persistence boundary (`libs/backend/feature/auth/main/lib/src/application/auth.service.ts:316-331`, `libs/backend/feature/auth/main/lib/src/application/external-auth.service.ts:433-468`).
- Notification template resolution is tenant-first, then shared-only (`tenantId=null`), and requires a published current version supporting every requested delivery/in-app channel (`libs/backend/postgres/main/notification/lib/src/repositories/postgres-notification-persistence.ts:412-435`, `libs/backend/postgres/main/notification/lib/src/repositories/postgres-notification-persistence.ts:475-503`; Mongo parity at `libs/backend/mongodb/main/notification/lib/src/mongo-notification.persistence.ts:366-390`, `libs/backend/mongodb/main/notification/lib/src/mongo-notification.persistence.ts:417-436`).
- PostgreSQL and MongoDB independently validate caller and target tenant membership, and serialize last-powerful-admin mutations (`libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/repositories/admin-user-mutation.repository.ts:72-103`, `libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/repositories/admin-user-mutation.repository.ts:108-144`; Mongo at `libs/backend/mongodb/main/auth/lib/src/auth-mongo-admin.repository.ts:142-194`).
- Fiat rate text is validated, normalized, and converted through exact ratios. PostgreSQL and MongoDB persist canonical text and commit a rate batch atomically (`libs/backend/feature/fiat-currency/shared/lib/src/fiat-currency-rate.ts:22-67`, `libs/backend/postgres/main/fiat-currency/lib/src/infrastructure/data-access/repositories/fiat-currency.repository.ts:117-169`, `libs/backend/mongodb/main/fiat-currency/lib/src/fiat-currency-mongo.repository.ts:123-179`).
- Registered non-ISO provider assets such as `USDT` and `USDC` are explicit, scale-checked, and rendered without ECMA-402 currency mode (`libs/common/money/lib/src/money.ts:124-146`, `libs/common/money/lib/src/money.ts:354-388`).

No remaining P0/P1 is known after the validations listed below.

## Isolation matrix

| Surface | Ownership class | Trusted selector | Persistence/selection enforcement | Cross-tenant disposition |
| --- | --- | --- | --- | --- |
| Auth users, identities, methods, provider tokens, roles, grants, audit/outbox | Tenant-owned | Authenticated principal tenant, or persisted one-time token for anonymous redemption/linking | Tenant predicates are present on target and actor lookups; complete table inventory is recorded in `TenantScopedTablesByDomain` | Reject/not found; another tenant is never a fallback |
| Email verification/password reset token | Tenant-owned token; globally unique opaque hash | Persisted token record | Omitted/null tenant performs global hash+purpose lookup; explicit trusted tenant narrows the lookup; one-time atomic consume | Caller compatibility `tenantId` cannot select ownership; wrong trusted tenant does not consume |
| External identity link token | Tenant-owned token; globally unique opaque hash | Authenticated principal, otherwise persisted link token | Authenticated linking uses principal subject/tenant; anonymous linking must consume the link token and use its subject/tenant | Caller tenant field is ignored as an ownership selector |
| Admin/RBAC mutation | Tenant-owned | Requested tenant validated independently against caller and target | PostgreSQL tenant advisory transaction lock plus actor/target predicates and in-lock powerful-admin count; Mongo tenant serialization plus actor/target predicates and in-transaction count | Cross-tenant caller and cross-tenant target both fail closed |
| Ordinary notification, broadcast, segment, delivery ownership | Tenant-owned | Notification/broadcast tenant | Durable non-null notification tenant; persistence carries tenant into recipient lookup and writes | Other tenants are not query candidates |
| Notification template | Tenant override plus shared tier | Principal/request tenant, then exactly `tenantId=null` | Current version must be published and support every requested delivery channel plus in-app when requested | An unusable tenant override permits shared fallback; another tenant never does |
| Fiat catalogue and rate history | Global operator-owned reference data | Operator/catalogue API, not a tenant principal | Persistence models contain no tenant discriminator; canonical text is shared across both backends | Same catalogue/rate history on every tenant axis |
| Negotiated pricing/quotes/orders | Tenant-owned product data, outside this feature | Future pricing/product principal | Must live in a separate tenant-owned feature rather than mutating global fiat reference data | Not implemented by this catalogue |

The authoritative strict/shared inventory and its rationale are at `libs/backend/common/tenant-policy/lib/src/tenant-policy.ts:48-99`. The fiat global classification is normative at `openspec/specs/fiat-currency-catalog/spec.md:12-19`.

## Authentication and token trust boundaries

### User-action tokens

Confirmation and reset derive both user and tenant from the consumed record (`libs/backend/feature/auth/main/lib/src/application/auth.service.ts:171-180`, `libs/backend/feature/auth/main/lib/src/application/auth.service.ts:316-331`). The public DTO retains `tenantId` only as a deprecated compatibility field and says the server derives ownership (`libs/backend/feature/auth/main/lib/src/interfaces/http/dto/local-auth.dto.ts:55-82`).

PostgreSQL consumption performs a locked transaction lookup by hash, purpose, unused state, and expiry; tenant is included only when a trusted filter was supplied (`libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/repositories/auth-token.repository.ts:65-90`). MongoDB uses one atomic `findOneAndUpdate` with equivalent optional filtering (`libs/backend/mongodb/main/auth/lib/src/auth-mongo-token.repository.ts:60-77`). Token hashes are globally unique in PostgreSQL (`libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/entities/auth-token.entity.ts:50-58`) and MongoDB (`libs/backend/mongodb/main/auth/lib/src/auth-mongo.collections.ts:110-126`). This makes ownership discovery unambiguous while preserving one-time consumption.

### External link tokens

Authenticated linking uses only the principal tenant/subject. Anonymous linking requires a link token, consumes it without trusting a caller tenant, and uses the token record's tenant/user (`libs/backend/feature/auth/main/lib/src/application/external-auth.service.ts:433-468`). Link-token hashes are globally unique in PostgreSQL (`libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/entities/auth-link-token.entity.ts:67-74`) and MongoDB (`libs/backend/mongodb/main/auth/lib/src/auth-mongo.collections.ts:204-236`). Compatibility tenant fields are marked deprecated and ignored (`libs/backend/feature/auth/main/lib/src/interfaces/http/dto/external-auth.dto.ts:10-20`).

Unknown, expired, consumed, revoked, wrong-purpose, and wrong-trusted-tenant cases fail closed; the confirm surface intentionally gives a uniform invalid/replayed response.

## Notification ownership, fallback, and migration safety

Selection order is fixed:

1. Usable template for the principal/request tenant.
2. Usable shared template with `tenantId=null`.
3. Existing not-found or invalid-template/channel error.

A candidate is usable only when it has a current version, that version is published, every requested delivery channel is represented, and in-app is represented when requested (`libs/backend/postgres/main/notification/lib/src/repositories/postgres-notification-persistence.ts:475-503`; Mongo `libs/backend/mongodb/main/notification/lib/src/mongo-notification.persistence.ts:366-390`). An unusable tenant override therefore does not hide a usable shared template.

The PostgreSQL ownership migration adds durable notification ownership, backfills from broadcast ownership where possible, and raises before completion if any ordinary notification remains unresolved (`libs/backend/postgres/main/notification/lib/src/infrastructure/data-access/migrations/Migration20260826190000NotificationTenantOwnership.ts:5-33`). The native guard demonstrated transactional rollback: the temporary ownership column and the earlier partial backfill were absent after the exception (`test-results/tenant-currency-audit/final-run/postgres-notification-ownership-migration-guard-final.log`).

The MongoDB migration preflights every missing notification owner before performing backfills, normalizes missing template ownership to the shared `null` tier, and refuses incomplete or destructive reversal (`libs/backend/mongodb/main/notification/lib/src/migrations/Migration20260826190100NotificationTenantOwnership.ts:17-71`, `libs/backend/mongodb/main/notification/lib/src/migrations/Migration20260826190100NotificationTenantOwnership.ts:76-100`). The native guard recorded `mutated:false` for ambiguous legacy ownership (`test-results/tenant-currency-audit/final-run/mongodb-notification-ownership-migration-guard-final.log`).

## RBAC caller/target axes and last-admin concurrency

PostgreSQL obtains a tenant-keyed advisory transaction lock using the current transaction context, then independently queries the target and actor with the same tenant predicate (`libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/repositories/admin-user-mutation.repository.ts:72-80`, `libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/repositories/admin-user-mutation.repository.ts:108-127`). The powerful-admin count occurs after acquiring the tenant lock and before the mutation; safety rejects self-lockout and the last powerful administrator (`libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/repositories/admin-user-mutation.repository.ts:83-103`, `libs/backend/postgres/main/auth/lib/src/infrastructure/data-access/repositories/admin-user-mutation.repository.ts:127-144`). Native PostgreSQL evidence passed target-axis rejection, caller-axis rejection, and concurrent demotion serialization: 3/3 tests (`test-results/tenant-currency-audit/final-run/local-postgres-auth-component-final.log`).

MongoDB serializes on the tenant, performs independent target and actor lookups, applies the mutation in one transaction, then refuses a zero-powerful-admin result (`libs/backend/mongodb/main/auth/lib/src/auth-mongo-admin.repository.ts:142-194`). Native Mongo evidence passed 11/11 tests, including both cross-tenant axes and concurrent preservation of one powerful administrator (`test-results/tenant-currency-audit/final-run/local-mongodb-auth-component-clean.log`).

## Fiat classification and exact money behavior

### Classification

The fiat catalogue, current rates, and immutable rate observations are operator-owned global reference data. They intentionally carry no tenant discriminator, and the same data is visible from every tenant axis (`openspec/specs/fiat-currency-catalog/spec.md:12-19`). Tenant-specific commercial terms, negotiated prices, quotes, orders, fees, and balances must remain tenant-owned in their respective product domains; they must not be encoded by changing the shared catalogue.

### Persistence and arithmetic

- Decimal API/storage values stay decimal text. `normalizeFiatRateText` validates shape and numeric bounds, removes only non-significant zero padding, requires a positive rate, and returns canonical text (`libs/backend/feature/fiat-currency/shared/lib/src/fiat-currency-rate.ts:22-67`).
- Cross-rate conversion builds an exact rational with `BigInt`, reduces it, and delegates only the final minor-unit decision to the explicit money rounding policy (`libs/backend/feature/fiat-currency/shared/lib/src/fiat-currency-rate.ts:112-136`).
- PostgreSQL normalizes numeric scale padding when reading and before comparing/persisting observations; the catalogue row and history observation are updated in one transaction under a pessimistic currency lock (`libs/backend/postgres/main/fiat-currency/lib/src/infrastructure/data-access/repositories/fiat-currency.repository.ts:20-39`, `libs/backend/postgres/main/fiat-currency/lib/src/infrastructure/data-access/repositories/fiat-currency.repository.ts:117-169`).
- MongoDB validates the complete batch before opening a transaction, stores canonical strings, preserves idempotent provider observations, and updates history/headline in the same replica-set transaction (`libs/backend/mongodb/main/fiat-currency/lib/src/fiat-currency-mongo.repository.ts:123-179`).
- Bounded production scans found no product money/rate/price call site using `parseFloat`, `toFixed`, or ad-hoc `Math.round`/`Math.floor`/`Math.ceil`. The remaining numeric conversions found outside `common-money` were counts, percentages, times, retry delays, ports, and other non-money values.

### Provider assets and FX/provider runtime

Non-ISO asset codes are accepted only after explicit registration with a minor-unit exponent. Codes are constrained to 3-12 uppercase ASCII letters/digits beginning with a letter, so provider assets such as `USDT` and `USDC` are supported without weakening validation (`libs/common/money/lib/src/money.ts:124-146`). Registered non-ISO assets use locale decimal formatting plus the code and explicitly remove `Intl` currency options; ISO codes retain native currency formatting (`libs/common/money/lib/src/money.ts:354-388`).

There is no payment-provider implementation, production FX source, or application module currently wiring `FiatCurrencyMainModule.forRoot`. The only `forRoot` expressions outside tests are setup-catalog generation templates (`packages/tooling/src/setup/catalog.ts:560-585`), and no app under `apps/` imports the module. The rate-source contract is therefore available, but production refresh/provider behavior is not deployed.

## Validation evidence

### Executed and passed

| Area | Evidence |
| --- | --- |
| Tenant policy | 1 file, 25 tests; `test-results/tenant-currency-audit/final-run/tenant-policy-coverage.log` |
| Auth feature | 31 files, 213 tests; `test-results/tenant-currency-audit/final-run/auth-main-test-final-token-ownership.log` |
| PostgreSQL auth/RBAC/token | 47 files, 292 tests; `test-results/tenant-currency-audit/final-run/postgres-auth-test-final-rbac.log` |
| MongoDB auth | 4 files, 16 tests; `test-results/tenant-currency-audit/final-run/mongodb-auth-test-final-token-ownership.log` |
| Native PostgreSQL auth component | 1 file, 3 tests; `test-results/tenant-currency-audit/final-run/local-postgres-auth-component-final.log` |
| Native MongoDB auth component | 1 file, 11 tests; `test-results/tenant-currency-audit/final-run/local-mongodb-auth-component-clean.log` |
| PostgreSQL notification unit/migration | 4 files, 38 tests; `test-results/tenant-currency-audit/final-run/postgres-notification-test-after-component-fallback.log` |
| MongoDB notification unit/migration | 2 files, 8 tests; `test-results/tenant-currency-audit/final-run/mongodb-notification-test-after-fallback.log` |
| Native notification components | PostgreSQL 7 tests and MongoDB 15 tests; `local-postgres-notification-component-final.log`, `local-mongodb-notification-component-clean.log` |
| Notification ownership migration guards | PostgreSQL rollback and MongoDB preflight/no mutation; `postgres-notification-ownership-migration-guard-final.log`, `mongodb-notification-ownership-migration-guard-final.log` |
| Fiat packages | Shared 26, main 30, PostgreSQL 44, MongoDB 36 tests; `test-results/tenant-currency-audit/final-run/fiat-tests-final.log` |
| Native fiat components | PostgreSQL 7 tests, MongoDB 8 tests; `local-postgres-fiat-component-final.log`, `local-mongodb-fiat-component-clean.log` |
| Common money | 1 file, 31 tests; `test-results/tenant-currency-audit/final-run/common-money-test-final.log` |
| Frontend API client | 6 files, 39 tests; `test-results/tenant-currency-audit/final-run/frontend-api-client-test-current.log` |
| Typecheck | All focused tenant/auth/notification/fiat/money/contracts/client projects passed; refreshed auth and PostgreSQL RBAC evidence in `auth-typechecks-final-token-ownership.log` and `postgres-auth-typecheck-lint-final-rbac.log` |
| Lint | Focused packages passed after final fixes. Auth has one pre-existing `no-await-in-loop` warning in `telegram-oidc.spec.ts`; no errors (`auth-lints-final-token-ownership.log`, `postgres-auth-typecheck-lint-final-rbac.log`, fiat/notification lint logs) |
| Generated contracts/clients | Contract and frontend client freshness passed; `test-results/tenant-currency-audit/final-run/generated-contracts-clients-fresh-final.log` |
| Migration registry | 45 migrations checked; `test-results/tenant-currency-audit/final-run/db-migrations-check-fresh-final.log` |
| Documentation | 397 Markdown files, 1,149 local links, 32 anchors, 775 root-script references; `final-artifact-validation.log` |
| OpenSpec | 101/101 projects, 603/603 behavior tests, 63 requirements, no errors/warnings; `spec-validate-final-post-rbac.log` |

### Skipped/unavailable

The standard Docker-backed PostgreSQL and MongoDB notification component targets were invoked but skipped because Docker is unavailable on this host: PostgreSQL 5 skipped and MongoDB 13 skipped (`test-results/tenant-currency-audit/final-run/notification-component-tests-current.log`). They are not reported as executed. Equivalent focused native local database suites were executed and passed as listed above.

No payment-provider, production FX-provider, or end-to-end application runtime suite could be executed because those implementations/wirings do not exist.

## Honest P2 limitations

1. **Fiat runtime integration:** no application currently wires `FiatCurrencyMainModule.forRoot`, and no production rate source is registered. Catalogue repositories and refresh orchestration are verified, but a deployed runtime is absent.
2. **Payment/FX providers:** there is no payment-provider implementation or network FX adapter to audit for callback tenant binding, provider idempotency, quotas, stale-rate policy, or operational failover.
3. **Repository-predicate tenancy:** the current runtime intentionally does not engage PostgreSQL RLS; correctness depends on complete explicit repository predicates. The authoritative inventory and tests reduce drift risk, but adding a new tenant-owned table still requires registering and testing it.
4. **Compatibility DTO fields:** deprecated caller `tenantId` fields remain in generated public contracts for compatibility. The server ignores them for ownership selection; removal is a future breaking-contract cleanup.
5. **Standard Docker lane:** Docker-backed component targets remain unavailable in this environment. Native local PostgreSQL/MongoDB suites supplied the database evidence for this audit, but CI should continue running the standard component lanes.

## Final P0/P1 statement

The audited tenant ownership, token trust, notification fallback/migration, RBAC concurrency, exact-fiat, generated-contract, and provider-asset P0/P1 items are resolved. The remaining items above are P2 integration/operational limitations, not known tenant-isolation or money-correctness escapes in the implemented paths.
