# AI repo map

This file is the agent-oriented map for fast context retrieval. It summarizes where to look first; it does not replace the root [README](../../README.md), [AGENTS.md](../../AGENTS.md), [AI agent policy](agent-policy.md), or the detailed architecture docs.

## Source order

1. Always start with [AGENTS.md](../../AGENTS.md) for short repository policy.
2. Read [AI agent policy](agent-policy.md) for non-trivial implementation, review, CI, docs, release, or generated-artifact work.
3. Use [README.md](../../README.md) for the current system overview and top-level path map.
4. Use this file to choose the next focused docs and code paths.
5. Verify behavior in source, tests, project configuration, generated contracts, and local commands before changing docs or code.

## Runtime surfaces

| Surface                        | Paths                                                          | Primary docs                                                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend APIs and workers       | `apps/backend/<scope>/**`                                      | [Architecture](../architecture.md), [API contracts](../api-contracts.md), [API conventions](../api-conventions.md), [Deployment](../deployment.md)                  |
| Frontend apps                  | `apps/frontend/**`                                             | [Frontend FSD](../frontend-fsd.md), [Frontend state](../frontend-state.md), [Frontend deployment topology](../frontend-deployment-topology.md)                      |
| E2E apps                       | `apps/e2e/**`                                                  | [Testing](../testing.md), [Modern QA](../testing/modern-qa.md), [Command matrix](../command-matrix.md)                                                              |
| Backend common libraries       | `libs/backend/common/**`                                       | [Architecture](../architecture.md), [Production hardening](../production-hardening.md)                                                                              |
| Backend feature libraries      | `libs/backend/feature/<scope>/<layer>/lib/**`                  | [Architecture naming and boundaries](../architecture/naming-and-boundaries.md), [DDD clean architecture](../architecture/ddd-clean-architecture.md)                 |
| PostgreSQL infrastructure      | `libs/backend/postgres/main/**`                                | [Database migrations](../database-migrations.md)                                                                                                                    |
| Frontend libraries             | `libs/frontend/**`                                             | [Frontend FSD](../frontend-fsd.md), [Frontend state](../frontend-state.md), [Frontend UX](../frontend-ux.md)                                                        |
| Cross-runtime common libraries | `libs/common/**`                                               | [Architecture](../architecture.md), package-level project configs                                                                                                   |
| Repository tooling             | `packages/tooling/**`                                          | [Command matrix](../command-matrix.md), [Local verification](../local-verification.md)                                                                              |
| Operations and runbooks        | `docs/operations/**`, `docs/runbooks/**`, `docs/operations.md` | [Operations](../operations.md), [Runbooks](../runbooks/README.md), [Production deploy](../production-deploy.md), [Production readiness](../production-readiness.md) |

## Current deployables

Backend deployables:

- `admin-app-api`: `apps/backend/admin/admin-app-api`
- `auth-app-api`: `apps/backend/auth/auth-app-api`
- `user-app-api`: `apps/backend/user/user-app-api`
- `discord-app-api`: `apps/backend/discord/discord-app-api`
- `telegram-bot-api`: `apps/backend/telegram/telegram-bot-api`
- `telegram-bot-worker`: `apps/backend/telegram/telegram-bot-worker`

Frontend deployables:

- `admin-app`: `apps/frontend/admin`
- `user-app`: `apps/frontend/app`
- `landing-app`: `apps/frontend/landing`
- `site-app`: `apps/frontend/site`
- `mobile-app`: `apps/frontend/mobile`

E2E app projects:

- `fullstack-e2e`: `apps/e2e/fullstack`

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
