---
name: develop-backend-api
description: Implement NestJS Fastify API behavior within repository runtime contracts. Use for controllers, DTOs, modules, domain services, RFC 9457 errors, request context, health behavior, and API-focused tests.
---

# Develop a backend API

## Read first

- Read `../../../docs/architecture.md`, `../../../docs/api-conventions.md`,
  `../../../docs/project-catalog.md`, and the nearest app and library `AGENTS.md` files.
- Inspect the owning composition root, controller, DTO, domain service, persistence adapter, exception registry, and tests before editing.
- Use `../plan-backend-change/SKILL.md` when scope or ownership is unresolved and
  `../validate-backend-quality/SKILL.md` for final backend proof.

## Workflow

1. Keep deployable composition under `apps/backend/<scope>` and reusable behavior under `libs/backend`. Modify an existing owner in place.
2. Validate input at the transport boundary and keep domain behavior independent of HTTP.
3. Create errors through the repository exception factory. Register custom problem types in `@app/common-problem-details`; never expose internal exception messages.
4. Read request identifiers from `requestContext`; do not manually thread or generate competing IDs.
5. Preserve Fastify, localization, logging, health/readiness, authorization, and transaction conventions of the owner.
6. Add unit or integration coverage for success, validation, authorization, not-found/conflict, and infrastructure failure paths as applicable.
7. When the public API changes, continue with `$change-api-contract`.

## Verification

Run the owning project lint, typecheck, test, build, and applicable integration/e2e target. Run `git diff --check` and broaden to shared consumers when a public alias or backend-common contract changes.
