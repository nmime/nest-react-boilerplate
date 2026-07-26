---
name: develop-background-process
description: Implement backend consumers and schedulers with safe lifecycle behavior. Use for NATS or Redis workers, scheduled jobs, retries, idempotency, graceful shutdown, app-context bootstrapping, and worker-focused tests.
---

# Develop a background process

## Read first

- Read `../../../docs/architecture.md`, `../../../docs/project-catalog.md`, and
  the nearest deployable and library `AGENTS.md` files. Read
  `../../../docs/nats.md` or `../../../docs/notifications.md` when that transport
  or workflow is in scope.
- Inspect the process entrypoint, Nest application context, subscription or schedule owner, persistence boundary, retry policy, and shutdown hooks.
- Use `../plan-backend-change/SKILL.md` when scope or ownership is unresolved and
  `../validate-backend-quality/SKILL.md` for final process proof.

## Workflow

1. Keep consumers and schedulers as separate backend deployables. Do not add HTTP listeners unless the documented runtime contract requires one.
2. Put reusable job behavior in backend libraries and keep transport/schedule binding in the deployable composition root.
3. Define idempotency, concurrency, acknowledgement, retry, backoff, poison-message, and terminal-failure behavior before implementation.
4. Bound every external call with timeout and cancellation behavior. Preserve correlation/request context when an incoming event supplies it.
5. Make startup fail clearly when required resources are absent and make shutdown stop intake before draining in-flight work.
6. Add deterministic tests for duplicate delivery, retry, terminal failure, partial infrastructure failure, and shutdown where applicable.

## Specification lifecycle

For observable behavior, establish or update the governing requirements with
`$specify-behavior` before implementation. Execute the approved artifacts and
synchronize test markers, sidecars, and evidence with
`$implement-specified-change`.

## Verification

Run the owning project lint, typecheck, tests, build, and Docker/Testcontainers integration when required. If Docker is unavailable, report that boundary rather than describing the integration lane as passed.
