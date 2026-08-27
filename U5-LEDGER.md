# U5 provider framework ledger

## Commit 1 — provider framework implementation

Scope:

- Symbol-token Nest `useFactory` provider registry with duplicate-code boot rejection.
- `PaymentProviderResolver` with five-second tenant cache, explicit invalidation, tenant shadowing,
  case-normalized region allow/deny, kind and explicit-code selection, priority ordering, and health
  exclusion for new creates.
- Exact fail-closed RFC 9457 `payment-provider-unavailable` 503 for disabled, unconfigured,
  region-denied, down/disabled-health, missing-adapter, and no-match creates.
- Recovery exception: webhook and reconciler lookups bypass enabled, region, and health gates so
  in-flight payments can settle.
- `ProviderHealthService` thresholds: success → up/reset, auth → down immediately, two consecutive
  server/timeout → degraded, five errors in ten minutes → down, admin disable remains dominant.
- Shared injectable provider HTTP client with normalized `ProviderHttpError`, bounded sequential
  exponential retry/backoff, `Retry-After`, per-provider token bucket, concurrency semaphore,
  timeout/network normalization, and health evidence on every call.
- Provider problem exception mapping to credential-invalid/rate-limited/capability/unavailable 503s.
- OpenSpec evidence sidecar and U5 task completion updated.

Validation required before commit:

- Main and shared typecheck.
- Main and shared lint.
- Main and shared unit coverage: affected production source at 100% statements/functions/lines;
  existing one synthetic Nest decorator branch budget only.
- Prettier, `git diff --check`.
- `pnpm run spec:validate`.
- `pnpm run tooling:static-check` exact JSON key contract.
- Selected closure check and clean tree after commit.
