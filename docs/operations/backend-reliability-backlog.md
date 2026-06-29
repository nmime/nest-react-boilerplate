# Backend Reliability Backlog

> **Branch:** `integration/backend-reliability-backlog`
> **Base commit:** `9c649f8770965d99f741a332144da7af8a15a179` (main)
> **Status:** Planning-only backlog. No runtime code changes. Docs-only.
> **Last updated:** 2025-07-23

---

## Executive Summary

This backlog catalogs heavy backend reliability gaps verified by code inspection of the `nmime/nest-react-boilerplate` monorepo at the specified commit. The repo already has strong foundations in health checks, structured logging, request-ID correlation, RFC 9457 Problem Details, OTLP tracing/metrics export via OpenTelemetry auto-instrumentation, and Testcontainers-based integration testing.

The gaps identified below are **operational resilience** concerns that become critical at production scale: observability at the application level, fault isolation, safe retries, eventual consistency, and hardened container configuration.

---

## Verification Summary

| Gap | Verified Against | Evidence |
|-----|-----------------|----------|
| No `/metrics` endpoint | `search_code: prometheus metrics` returns only Helm OTLP collector references | No application-level metrics endpoint found; OTel exports metrics only to collector sidecar |
| No business/custom metrics | `search_code: opentelemetry` shows auto-instrumentation only | `libs/backend/common/otel/lib/src/otel.ts` uses `getNodeAutoInstrumentations`; no custom counters/histograms |
| No circuit breaker | `search_code: circuit breaker` returns 0 results | No `opossum`, `@nestjs/circuit-breaker`, or equivalent pattern |
| No idempotency middleware/store | `search_code: idempotency` returns only doc references (notifications.md, test checklist template) | No middleware, interceptor, or Redis-backed idempotency store implementation |
| Outbox entity exists but no consumer | `search_code: outbox` finds entity, migration, spec under auth lib | `TransactionalOutboxEventEntity` with schema and tests exist, but no polling consumer or publisher service found |
| No tini/seccomp/read-only hardening | `search_code: tini seccomp read-only` returns 0 results; `Dockerfile` exists at root | `Dockerfile` uses `node:26.1.0-alpine` base; no `tini`, `USER nonroot`, `--read-only`, or seccomp profile |
| Limited e2e for edge cases | `search_code: e2e integration test` shows existing test:e2e targets | `health.e2e-spec.ts` covers basic health and problem-details; no e2e for rate-limit, exception filter, or shutdown |

---

## Phase 1 — Observability & Metrics (Week 1–2)

**Risk:** Low  **Cost:** 3–5 days  **Depends on:** Nothing

### 1.1 Application-level Prometheus `/metrics` endpoint

**Problem:** The application exports OTLP metrics to a sidecar collector (Helm: `monitoring.otelCollector.enabled`), but there is no direct `/metrics` endpoint on the NestJS apps. This means:

- Standalone Docker Compose deployments have no Prometheus scrape target.
- Kubernetes ServiceMonitors can only scrape the collector, not the app.
- No application-level custom metrics are exposed.

**Target area:**

- `libs/backend/common/otel/lib/src/otel.ts` — add a Prometheus HTTP server (`prom-client`) or expose OTLP metrics via a `/metrics` route.
- `libs/backend/common/health/lib/src/` — consider adding a `metrics.controller.ts` under the health module.
- `apps/backend/*/src/main.ts` — wire the metrics endpoint if not auto-mounted.

**Dependencies:**

- `prom-client` (or use existing `@opentelemetry/exporter-prometheus` if available).
- No major version conflicts expected.

**Validation:**

- Unit: metrics counter/histogram registration and increment.
- E2E: `GET /metrics` returns `text/plain` with expected metric families.
- Integration: Prometheus scrape of a running Docker Compose service succeeds.

**Safe now:** Yes. This is additive and backward-compatible.

---

### 1.2 Business/Custom Metrics Registry

**Problem:** Only auto-instrumented infrastructure metrics (HTTP, DB, Redis) are collected. No business-level counters (e.g., `auth_login_attempts_total`, `user_registered_total`) or histograms (e.g., `request_duration_seconds` with business labels).

**Target area:**

- `libs/backend/common/otel/lib/src/` — create a `MetricsService` that exposes a typed API for counters, gauges, and histograms.
- Each vertical slice (`auth`, `user`, `admin`) should import and use the metrics service.
- Follow the existing vertical-slice pattern: `libs/backend/postgres/main/<slice>/lib/`.

**Dependencies:**

- Phase 1.1 (metrics endpoint) must be in place.
- `@opentelemetry/api` for metric creation (already in `package.json`).

**Validation:**

- Unit: MetricsService creates and increments counters.
- E2E: Custom metrics appear in `/metrics` output after exercising endpoints.
- Coverage: Verify at least one business metric per active vertical slice.

**Safe now:** Yes, after Phase 1.1.

---

## Phase 2 — Fault Isolation & Resilience (Week 3–4)

**Risk:** Medium  **Cost:** 5–7 days  **Depends on:** Phase 1 (observability needed for validation)

### 2.1 Circuit Breaker Abstraction

**Problem:** No circuit breaker pattern exists for external dependency calls (e.g., Redis, NATS, database, external HTTP services). A single failing dependency can cascade and exhaust thread pools or connection pools.

**Target area:**

- `libs/backend/common/` — create a new package `circuit-breaker` with:
  - A `CircuitBreakerInterceptor` (NestJS interceptor).
  - A `CircuitBreakerDecorator` (`@CircuitBreaker()`).
  - Configuration via `ConfigService` (threshold, timeout, reset timeout).
  - Fallback mechanism (return cached, default, or Problem Details).

**Dependencies:**

- `opossum` (circuit breaker library for Node.js) or `@nestjs/circuit-breaker` if available.
- Phase 1 metrics for monitoring circuit state (open/half-open/closed).

**Validation:**

- Unit: Circuit opens after threshold failures, half-opens after timeout, closes after success.
- Integration: Redis/NATS failure triggers circuit open; subsequent calls fail fast.
- E2E: Simulated dependency failure does not crash the application.

**Safe now:** No. Requires dependency addition (`opossum`), testing infrastructure, and careful fallback design.

---

### 2.2 Idempotency Key Middleware & Store

**Problem:** No idempotency key support for POST/PUT operations. Retries from clients (or load balancers) can cause duplicate mutations (e.g., double charge, duplicate registration).

**Target area:**

- `libs/backend/common/` — create `idempotency` package:
  - Middleware that extracts `Idempotency-Key` header.
  - Redis-backed store (using existing `libs/backend/common/redis/lib`):
    - Check-and-set with TTL (e.g., 24 hours).
    - Store the response status and body hash for replay.
  - Skip for GET requests and non-mutating operations.

**Dependencies:**

- Redis (already available via `libs/backend/common/redis/lib`).
- Phase 1 metrics for idempotency hit/miss counters.

**Validation:**

- Unit: Middleware extracts key, checks store, returns cached response.
- Integration: Two identical requests with the same key return the same response.
- E2E: Retry scenario with network partition simulates duplicate prevention.

**Safe now:** No. Requires Redis schema design and careful middleware placement in bootstrap.

---

## Phase 3 — Eventual Consistency (Week 5–6)

**Risk:** Medium  **Cost:** 5–8 days  **Depends on:** Phase 2 (circuit breaker for robustness)

### 3.1 Outbox Consumer & Publisher

**Problem:** The `TransactionalOutboxEventEntity` and migration exist (`libs/backend/postgres/main/auth/lib/...`), but there is no consumer that polls pending outbox events and publishes them. The pattern is half-implemented.

**Target area:**

- `libs/backend/postgres/main/auth/lib/` or a new `libs/backend/common/outbox/lib/`:
  - `OutboxConsumerService` — polls `transactional_outbox_events` where `status = 'pending'`.
  - `OutboxPublisherService` — publishes to NATS (using existing `libs/backend/common/nats/lib`) or RabbitMQ.
  - Retry with exponential backoff and dead-letter handling.
  - Idempotent publish (check `status` before publishing).

**Dependencies:**

- NATS library (already in `libs/backend/common/nats/lib`).
- Phase 2 circuit breaker for NATS publish resilience.
- Redis for consumer lease/locking (prevent duplicate processing).

**Validation:**

- Unit: Consumer picks pending events, marks as `published`, handles failures.
- Integration: Event written in DB transaction appears in NATS within SLA.
- E2E: Application crash during write recovers on restart; no events lost.

**Safe now:** No. Requires significant wiring, NATS topic design, and integration testing.

---

## Phase 4 — E2E Coverage Expansion (Week 7–8)

**Risk:** Low  **Cost:** 4–6 days  **Depends on:** Phases 1–3 (test the new capabilities)

### 4.1 Exception Filter E2E

**Problem:** Global `ExceptionsFilter` and `ExceptionsResponseTransformer` are wired in bootstrap (`libs/backend/common/bootstrap/lib/src/bootstrap-nest-api.ts`), but e2e coverage for exception handling is limited.

**Target area:**

- `apps/backend/auth-app-api/src/health.e2e-spec.ts` — expand or add new e2e specs.
- Test scenarios:
  - Unknown route returns RFC 9457 Problem Details (404).
  - Validation pipe failure returns Problem Details (422).
  - Throttler failure returns Problem Details (429) — if throttler is wired.
  - Unhandled exception returns Problem Details (500).

**Validation:**

- E2E: Each scenario returns correct status code and Problem Details schema.
- Verify no raw stack traces or paths leak.

**Safe now:** Partially. Can add e2e tests for existing exception filter behavior now. Throttler e2e requires throttler implementation.

---

### 4.2 Rate Limit E2E

**Problem:** Bootstrap references `rate-limit-unavailable` problem type, suggesting throttler integration is planned. No rate limiting e2e tests exist.

**Target area:**

- `apps/backend/*/src/` — e2e specs for rate-limited endpoints.
- Test scenarios:
  - Nth request exceeds limit → 429.
  - Rate limit headers present (`X-RateLimit-Limit`, `X-RateLimit-Remaining`).
  - Rate limit resets after window.

**Dependencies:**

- `@nestjs/throttler` (check if already in `package.json` — search returned 0 results for throttler).

**Validation:**

- E2E: Rate limit triggers correctly with configurable thresholds.

**Safe now:** No. Requires throttler dependency and configuration.

---

### 4.3 Graceful Shutdown E2E

**Problem:** Shutdown handling exists (`ShutdownService`, NATS `onApplicationShutdown`, Redis `onApplicationShutdown`), but no e2e test verifies graceful shutdown behavior.

**Target area:**

- `apps/backend/*/src/` — e2e spec for shutdown:
  - Send SIGTERM to running NestJS app.
  - Verify: active requests complete, NATS disconnects, Redis disconnects, health endpoint returns 503.

**Validation:**

- E2E: Process exits cleanly within timeout. No connection leaks.

**Safe now:** Yes. This tests existing behavior.

---

## Phase 5 — Container Hardening (Week 9–10)

**Risk:** Low  **Cost:** 2–3 days  **Depends on:** Nothing (independent)

### 5.1 Docker Hardening

**Problem:** The root `Dockerfile` uses `node:26.1.0-alpine` but lacks:

- **tini** init system (zombie process reaping, proper signal forwarding).
- **Non-root user** (runs as root by default).
- **Read-only root filesystem** (`--read-only` in Compose/K8s).
- **Seccomp profile** (no custom or runtime/default profile reference).
- **stop_grace_period** in Compose (no graceful shutdown window).

**Target area:**

- `Dockerfile` — add `tini`, create non-root user, use `USER` directive.
- `docker-compose.yml` / `docker/docker-compose.yml` — add `read_only: true`, `tmpfs` for writable paths, `stop_grace_period: 30s`.
- `.helm/templates/deployment.yaml` — add `securityContext.readOnlyRootFilesystem`, `seccompProfile.type: RuntimeDefault`.

**Dependencies:**

- `tini` (available in Alpine via `apk add tini`).
- No new npm dependencies.

**Validation:**

- Build: Docker image builds successfully.
- Runtime: Container runs as non-root, signal handling works (SIGTERM → graceful shutdown).
- Security: `docker inspect` shows `ReadonlyRootfs: true`, `User: <nonroot>`.
- CIS Docker Benchmark check (manual).

**Safe now:** Yes. This is infrastructure/docs-only until someone implements the Dockerfile changes.

---

## Dependency Update Campaign

Items that should be deferred until after a dependency update campaign (`integration/deps-latest-npm` branch exists):

| Item | Reason |
|------|--------|
| Phase 1.1 (`prom-client` or Prometheus exporter) | May conflict with newer OpenTelemetry packages; update campaign first |
| Phase 2.1 (`opossum` or `@nestjs/circuit-breaker`) | Check compatibility with latest NestJS version from update campaign |
| Phase 4.2 (`@nestjs/throttler`) | May require NestJS 11+; verify after update campaign |

Items safe to implement now:

| Item | Reason |
|------|--------|
| Phase 1.2 (custom metrics) | Uses existing `@opentelemetry/api` already in the repo |
| Phase 3.1 (outbox consumer) | Uses existing NATS and DB libs |
| Phase 4.1 (exception filter e2e) | Tests existing behavior |
| Phase 4.3 (shutdown e2e) | Tests existing behavior |
| Phase 5.1 (container hardening) | No npm dependencies; Docker/Compose only |

---

## Risk Matrix

| Phase | Risk | Blast Radius | Rollback |
|-------|------|-------------|----------|
| 1 — Observability | Low | None (additive) | Remove `/metrics` route |
| 2 — Fault Isolation | Medium | Middleware affects all requests | Disable via feature flag |
| 3 — Outbox | Medium | DB writes, NATS topics | Disable consumer; events remain `pending` |
| 4 — E2E | Low | No runtime impact | Delete test files |
| 5 — Container | Low | Deployment config only | Revert Dockerfile/Compose |

---

## Definition of Done (per phase)

- [ ] All unit/integration tests green (`pnpm run test`).
- [ ] E2E tests for new behavior (`pnpm run test:e2e`).
- [ ] Lint/typecheck passes (`pnpm run check:fast`).
- [ ] Docs updated (this backlog + any relevant runbook in `docs/operations/`).
- [ ] CI passes on PR.
- [ ] No secrets or sensitive data in commits.

---

## References

- `AGENTS.md` — repo-wide agent rules and command matrix.
- `docs/command-matrix.md` — supported commands.
- `docs/testing/modern-qa.md` — QA matrix and preset commands.
- `docs/operations/observability-dr.md` — existing SRE runbook.
- `docs/api-conventions.md` — API conventions and Problem Details usage.
- `libs/backend/common/otel/lib/src/otel.ts` — OTLP instrumentation.
- `libs/backend/common/health/lib/src/shutdown.service.ts` — shutdown service.
- `libs/backend/postgres/main/auth/lib/.../transactional-outbox-event.entity.ts` — outbox entity.
- `Dockerfile` — current container build.
- `docker-compose.yml` / `docker/docker-compose.yml` — current Compose config.
- `.helm/README.md` — Helm chart observability toggles.
