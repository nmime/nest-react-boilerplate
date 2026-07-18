# AI repo map

This file is the agent-oriented map for fast context retrieval. It summarizes where to look first; it does not replace the root [README](../../README.md), [AGENTS.md](../../AGENTS.md), [AI agent policy](agent-policy.md), or the detailed architecture docs.

## Source order

1. Always start with [AGENTS.md](../../AGENTS.md) for short repository policy.
2. Read [AI agent policy](agent-policy.md) for non-trivial implementation, review, CI, docs, release, or generated-artifact work.
3. Use [README.md](../../README.md) for the current system overview and top-level path map.
4. Use this file to choose the next focused docs and code paths.
5. Verify behavior in source, tests, project configuration, generated contracts, and local commands before changing docs or code.

## Runtime surfaces

| Surface                        | Paths                                                                                  | Primary docs                                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend APIs and workers       | `apps/backend/<scope>/**`                                                              | [Project catalog](../project-catalog.md), [Architecture](../architecture.md), [API contracts](../api-contracts.md), [API conventions](../api-conventions.md), [Deployment](../deployment.md) |
| Frontend apps                  | `apps/frontend/**`                                                                     | [Project catalog](../project-catalog.md), [Frontend FSD](../frontend-fsd.md), [Frontend state](../frontend-state.md), [Frontend deployment topology](../frontend-deployment-topology.md)     |
| E2E apps                       | `apps/e2e/**`                                                                          | [Project catalog](../project-catalog.md), [Testing](../testing.md), [Modern QA](../testing/modern-qa.md), [Command matrix](../command-matrix.md)                                             |
| Backend common libraries       | `libs/backend/common/**`                                                               | [Architecture](../architecture.md), [Production hardening](../production-hardening.md)                                                                                                       |
| Backend feature libraries      | `libs/backend/feature/<scope>/<layer>/lib/**`                                          | [Architecture naming and boundaries](../architecture/naming-and-boundaries.md), [DDD clean architecture](../architecture/ddd-clean-architecture.md)                                          |
| PostgreSQL infrastructure      | `libs/backend/postgres/main/**`                                                        | [Database migrations](../database-migrations.md)                                                                                                                                             |
| Frontend libraries             | `libs/frontend/**`                                                                     | [Frontend FSD](../frontend-fsd.md), [Frontend state](../frontend-state.md), [Frontend UX](../frontend-ux.md)                                                                                 |
| Cross-runtime common libraries | `libs/common/**`                                                                       | [Architecture](../architecture.md), package-level project configs                                                                                                                            |
| Repository tooling             | `packages/tooling/**`                                                                  | [Command matrix](../command-matrix.md), [Local verification](../local-verification.md)                                                                                                       |
| Compose production topology    | `docker/docker-compose.prod*.yml`, `docker/caddy/**`, `scripts/compose-production.mjs` | [Compose production](../docker-compose-production.md), [Deployment](../deployment.md), [Frontend deployment topology](../frontend-deployment-topology.md)                                    |
| Single-server host lifecycle   | `deploy/single-server/**`, `scripts/single-server-deployment.mjs`                      | [Single-server deployment](../single-server-deployment.md), [Compose production](../docker-compose-production.md)                                                                            |
| Operations and runbooks        | `docs/operations/**`, `docs/runbooks/**`, `docs/operations.md`                         | [Operations](../operations.md), [Runbooks](../runbooks/README.md), [Production deploy](../production-deploy.md), [Production readiness](../production-readiness.md)                          |

## Backend cross-cutting concerns

| Concern               | Package / Path                                                                                                 | Agent doc reference                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Request Context (CLS) | `@app/backend-common-bootstrap` / `libs/backend/common/bootstrap/lib`                                          | [Agent policy: Request Context](agent-policy.md#request-context-cls)                |
| Exception System      | `@app/backend-common-exception` / `libs/backend/common/exception/lib`                                          | [Agent policy: Exception System](agent-policy.md#exception-system-rfc-9457)         |
| Health checks         | `@app/backend-common-health` / `libs/backend/common/health/lib`                                                | [Agent policy: Monorepo Layout](agent-policy.md#monorepo-layout)                    |
| Capability activation | `packages/tooling/src/setup/**`, `apps/backend/**/capabilities.generated.ts`                                   | [Setup](../setup/configuration.md), [Presets](../setup/presets-and-technologies.md) |
| Notifications         | `libs/common/notifications`, `libs/backend/feature/notification/**`, `libs/backend/postgres/main/notification` | [Notifications](../notifications.md)                                                |

### Request Context (CLS)

- **No** `nestjs-cls` or third-party CLS dependency — uses Node.js built-in `AsyncLocalStorage`.
- Access via `import { requestContext } from '@app/backend-common-bootstrap'`.
- Key API: `requestContext.getRequestId()`, `requestContext.get(key)`, `requestContext.set(key, value)`.
- See [agent-policy.md](agent-policy.md#request-context-cls) for usage patterns.

### Exception System (RFC 9457)

- All exceptions use `@app/backend-common-exception` — do not invent new exception bases.
- Factory: `Exception({ name, kind, problemType, title, detail, status })`.
- Domain classes: `ResourceNotFoundException`, `UnauthorizedException`, `ForbiddenException`, `ConflictException`, `BadRequestException`, `InternalException`.
- Wire format: RFC 9457 `application/problem+json`.
- **Do not reference** `AppHttpException`, `BaseExceptionInput`, or `ProblemDetailsInput` — these do not exist.
- See [agent-policy.md](agent-policy.md#exception-system-rfc-9457) for full patterns.

## Current deployables

Every cataloged deployable is independently selectable. The `fullstack` profile is
an explicit shortcut for all core product frontends, the admin/user/auth APIs,
and fullstack E2E; bot APIs remain explicit integrations. No deployable is a
repository default, and setup may be rerun to add another app without replacing
the current selection.
Use the generated [Project Catalog](../project-catalog.md) for exact IDs, Nx
roots, runtimes, dependencies, and template hostnames. See the
[Scaffolding and Extension Contract](../scaffolding-and-extension.md) before
adding or registering a deployable.

Library projects:

- Every `libs/**/lib/project.json` root has a local `README.md` and `AGENTS.md`
  for nearest ownership, tags, and supported Nx targets.

## Generated and review-only surfaces

Do not hand-edit generated artifacts unless the task explicitly includes regeneration.

- OpenAPI producer output: `apps/backend/*/*-app-api/contracts/openapi/*.json`
- Shared generated API contract review types: `libs/common/api-contracts/lib/src/generated`
- Generated frontend API clients: `libs/frontend/api-client/lib/src/generated`
- Snapshots, coverage, build output, Playwright output, `.nx/`, and local database volumes

## Path-specific context rule

Use nested `AGENTS.md` files for durable subtree rules only; leaf app/library/package files stay thin and point to the closest platform rules plus their README. Prefer project `README.md` files for setup notes and `docs/ai/agent-workflows.md` or `.agents/skills/**` for repeatable agent procedures.
