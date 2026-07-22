---
name: validate-backend-quality
description: Select and run risk-based quality gates for backend APIs, consumers, schedulers, persistence, and shared runtime libraries. Use before backend handoff or merge, after backend implementation, or when contracts, migrations, authorization, infrastructure, retries, concurrency, health, observability, or deployment behavior must be proven.
---

# Validate backend quality

## Read first

- Read `../../../docs/testing.md`, `../../../docs/testing/modern-qa.md`,
  `../../../docs/command-matrix.md`, `../../../docs/local-verification.md`,
  affected project targets, and the nearest backend/e2e instructions.
- Inspect changed contracts, migrations, infrastructure dependencies, runtime
  entrypoints, health/readiness, and existing test boundaries before selecting gates.

## Build the gate map

- Classify each changed risk: API/DTO, domain behavior, authorization, database,
  messaging, consumer/scheduler lifecycle, backend-common runtime, configuration,
  generated artifacts, observability, performance, security, or deployment.
- Start with the narrowest check that can falsify the behavior, then broaden
  according to shared consumers, public compatibility, and runtime dependencies.

## Apply the gates

1. Run affected lint, typecheck, unit tests, build, formatting, and `git diff --check`.
2. For public APIs, test validation, auth, success, safe RFC 9457 failures, media
   types, localization, request IDs, and response schemas. Run OpenAPI and
   generated-client freshness plus affected consumer tests.
3. Use integration or Testcontainers tests for PostgreSQL, Redis, NATS,
   transactions, framework composition, and real adapter behavior. A missing
   Docker engine is an unverified lane, not a pass.
4. For migrations, prove fresh apply, upgrade from the prior schema, affected
   queries/constraints, and safe rollback when one exists. Inspect generated SQL.
5. For consumers and schedulers, prove duplicate delivery, idempotency,
   acknowledgement, retry/backoff, poison or terminal failure, concurrency,
   timeout, startup failure, and graceful shutdown as applicable.
6. Run API/process e2e for real composition, guards, persistence, messaging,
   health/readiness, and critical cross-service behavior.
7. Add security, tenant/isolation, secret/config, load/performance, observability,
   Docker/fullstack, and deployment validation when those risks changed.
8. Broaden backend-common, public alias, event, or contract changes to every
   affected deployable and repository consumer.

## Gate policy

- Do not replace real infrastructure proof with mocks when the changed contract
  depends on infrastructure behavior.
- Do not weaken assertions, retries, timeouts, coverage, security controls, or
  generated artifacts to silence failures.
- Separate source/unit evidence, integration evidence, runtime e2e, controlled
  external canaries, and deployment proof.
- Never run destructive or production operations without explicit current-task authorization.

## Report

List commands and outcomes by risk, name failure artifacts where available, and
state every unverified boundary. Pair with `../validate-change/SKILL.md` when the
diff also changes frontend, tooling, generators, or infrastructure ownership.
