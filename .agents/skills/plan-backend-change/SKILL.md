---
name: plan-backend-change
description: Plan a backend API, consumer, scheduler, persistence, or shared-runtime change before implementation. Use for multi-owner backend features, contract changes, new asynchronous workflows, migrations, infrastructure integration, or work whose boundaries, failure modes, rollout, and validation need to be resolved first.
---

# Plan a backend change

## Read first

- Read `../../../docs/ai/retrieval-policy.md`, `../../../docs/ai/repo-map.md`,
  `../../../docs/architecture.md`, `../../../docs/project-catalog.md`, and the
  nearest app/library `AGENTS.md`, README, project config, source, tests, and public exports.
- Read the relevant API, database, messaging, auth, notification, deployment,
  and testing guides selected through the repo map. Read
  `../validate-backend-quality/SKILL.md` for the proof plan.

## Resolve the plan

1. Identify the selected deployable and runtime: Nest API, consumer, scheduler,
   or reusable backend/common library. No backend application is the default.
2. Trace the existing owner before proposing structure: composition root,
   controller or process binding, domain service, port/adapter, persistence,
   contracts, configuration, health, observability, and e2e owner.
3. Define observable behavior and failure semantics, including validation,
   authorization, not-found/conflict, dependency failure, timeout, retry,
   duplicate delivery, partial failure, and shutdown where applicable.
4. Decide transaction, consistency, concurrency, idempotency, ordering, and
   compatibility boundaries before implementation details.
5. Record cross-boundary work explicitly: OpenAPI/generated clients, database
   migrations, NATS/Redis contracts, permissions, notifications, environment,
   deployment, and operations. Chain the matching repo skills.
6. Preserve repository runtime contracts: Fastify, RFC 9457, request context,
   localization, secret handling, health/readiness, and source-owned generated artifacts.
7. Build a risk-based validation map covering static, unit, integration,
   Testcontainers, API/process e2e, migration, contract, security, performance,
   observability, Docker, and deployment checks as applicable.
8. Sequence work into independently verifiable slices with rollback or
   compatibility steps for schema, public contract, and queued-event changes.

## Specification lifecycle

For observable behavior, establish or update the governing requirements with
`$specify-behavior` before implementation. Execute the approved artifacts and
synchronize test markers, sidecars, and evidence with
`$implement-specified-change`.

## Plan output

Produce a compact implementation brief with:

- selected runtime, owners, dependencies, and non-goals
- behavior, invariants, failure modes, and compatibility decisions
- data, contract, transaction, messaging, security, and operations effects
- ordered implementation and rollout slices
- quality gates for each material risk
- generated artifacts and documentation that must change
- unresolved decisions that would materially alter the solution

If implementation is also requested, execute the plan in place and revise it
when source evidence invalidates an assumption.
