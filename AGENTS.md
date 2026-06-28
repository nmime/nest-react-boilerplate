# AI agent instructions

This is the canonical instruction source for AI coding agents working in this repository. Agent-specific files must link here instead of copying divergent rules.

## Repository and safety rules

- Work only in `nmime/nest-react-boilerplate` unless a maintainer explicitly assigns another repository.
- Verify the target repo, branch, and current `main` SHA before edits, commits, pushes, or deployment work.
- Use Node.js `>=26 <27` and pnpm `11.6.0` (`packageManager: pnpm@11.6.0`). Prefer Corepack and `pnpm install --frozen-lockfile`.
- Do not expose secrets, tokens, real `.env*` values, Docker secret files, credentials, or full environment dumps in logs, diffs, issues, PRs, generated docs, or final reports.
- Do not deploy, publish packages/images, rotate credentials, run destructive database commands, or spend funds unless a maintainer explicitly requests it for the current task.
- Do not use Copilot, copilor, or any external AI coding assistant. Do the assigned work directly with the repository and approved tools.
- Read existing docs, configs, tests, and public APIs before editing. Do not create contradictory instructions or compatibility shims.
- Keep changes scoped. Do not edit generated artifacts (`apps/backend/*-app-api/contracts/openapi/**`, generated clients, snapshots, lockfiles) unless the task requires regenerating them.

## Commit, merge, and branch policy

- Every commit that must preserve repository ownership must use author and committer exactly `nmime <66474195+nmime@users.noreply.github.com>`.
- Configure both author and committer explicitly before committing; verify with `git show --format=fuller --no-patch HEAD`.
- Do not add `Co-authored-by`, `Signed-off-by`, Splox, Executor, bot, automation, or assistant trailers.
- Do not use GitHub web merge, web squash, API merge, or API squash for author-sensitive work. Use raw git branch commits and pushes with authenticated credentials.
- Do not force-push `main`. Create focused topic branches from current `main` and leave integration to the assigned maintainer or consolidator.

## Monorepo layout after the libs split

- Apps live under `apps/**`:
  - backend APIs: `apps/backend/**`
  - Vite React frontends: `apps/frontend/**`
- Backend common libraries live under `libs/backend/common/**`.
- Backend feature libraries live under `libs/backend/feature/**`.
- Backend PostgreSQL libraries live under `libs/backend/postgres/**`.
- Frontend-only libraries live under `libs/frontend/**`.
- True cross-runtime common libraries live under `libs/common/**`.
- Admin feature shared code is split by runtime. Do not recreate an unsplit shared admin project:
  - Frontend admin shared lives at `libs/frontend/feature/admin/shared/lib`, uses alias `@app/frontend/feature-admin-shared`, and carries `platform:frontend`, `type:feature-shared`, `scope:admin`, and `fsd:layer:shared` tags.
  - Backend admin shared lives at `libs/backend/feature/admin/shared/lib`, uses alias `@app/backend/feature-admin-shared`, and carries `platform:backend`, `type:feature-shared`, and `scope:admin` tags.
  - Respect platform boundaries: frontend code must not import backend admin libraries, and backend code must not import frontend admin libraries.
- Public package/path aliases in `tsconfig.base.json` are stable public API. Do not rename, remove, or repoint aliases unless the task explicitly includes an alias migration and all consumers/docs are updated.
- PostgreSQL shared infrastructure lives at `libs/backend/postgres/main/shared/lib`; feature persistence libraries live below `libs/backend/postgres/main/<feature>/lib`.
- Exception foundation is singular: use `@app/common/exception`, path `libs/backend/common/exception/lib`, Nx project `@app/common/exception`. Do not introduce or document an `exceptions` alias/path.
- RFC 9457 Problem Details wire terms are intentional and allowed: `ProblemDetails`, `application/problem+json`, `urn:problem:*`, `type`, `title`, `status`, `detail`, `instance`, and validation `errors[]` entries with `detail`/`pointer`. Do not add project-owned problem wrapper layers when the existing exception, validation, and response libraries cover the need.
- Shared health uses `@app/common/health` (`BaseHealthController`, `HealthService`, app-specific health providers/config) for `/health`, `/health/private`, `/live`, and `/ready`; document exact response shapes from source/tests before changing docs.

## API contracts and generated artifacts

- Nest controllers and DTOs are the source of truth for API shape.
- Committed OpenAPI producer output lives under `apps/backend/*-app-api/contracts/openapi/*.json`.
- Shared generated contract review types live under `libs/common/api-contracts/lib/src/generated`.
- Generated frontend clients live under `libs/frontend/api-client/lib/src/generated` and wrappers in `libs/frontend/api-client` keep endpoint paths out of app code.
- Do not invent top-level contract directories or alternate OpenAPI consumer locations.
- Treat generated files as read-only unless the task explicitly includes source changes plus regeneration. When regeneration is required, update source first, run the repository generator/check commands, and commit source plus generated diffs together.

## Architecture and docs to follow

- Architecture and split details: [`docs/architecture.md`](docs/architecture.md).
- Supported commands and project aliases: [`docs/command-matrix.md`](docs/command-matrix.md).
- Local verification: [`docs/local-verification.md`](docs/local-verification.md).
- Testing strategy: [`docs/testing.md`](docs/testing.md) and [`docs/testing/modern-qa.md`](docs/testing/modern-qa.md).
- Frontend FSD boundaries: [`docs/frontend-fsd.md`](docs/frontend-fsd.md).
- Frontend state rules: [`docs/frontend-state.md`](docs/frontend-state.md).
- UI/UX/design workflow: [`docs/frontend-uiux-pro-max-lazyweb.md`](docs/frontend-uiux-pro-max-lazyweb.md), [`docs/frontend-ux.md`](docs/frontend-ux.md), and [`docs/agent-skills.md`](docs/agent-skills.md).
- Database migrations: [`docs/database-migrations.md`](docs/database-migrations.md).
- API contract lifecycle: [`docs/api-contracts.md`](docs/api-contracts.md), [`docs/api-conventions.md`](docs/api-conventions.md), and [`docs/api-lifecycle-policy.md`](docs/api-lifecycle-policy.md).

## Validation expectations

Pick the smallest command set that proves the change, then broaden when touching shared/public APIs.

- Always run formatting or at least whitespace checks for edited Markdown/docs:
  - `pnpm exec prettier --check <files>` when dependencies are available.
  - a local Markdown link check when no repository docs-link script exists.
  - grep gates for stale RFC/problem/exception-library wording when touching API, architecture, or AI guidance docs.
  - `git diff --check` for every change.
- General code changes:
  - `pnpm run format:check` or `pnpm run format:changed`
  - `pnpm run lint`
  - `pnpm run typecheck`
  - relevant `pnpm run test`/Nx project tests
- Fast broad gate for normal PRs: `pnpm run check:fast`.
- Full non-runtime gate when contract, tooling, or public API surfaces are affected: `pnpm run check`.
- Library config changes: `pnpm run lib:configs:check`.
- Tooling changes under `packages/tooling/**`: `pnpm run tooling:static-check`.
- Database/API/workflow changes:
  - migrations: `pnpm run db:migrations:check`
  - rollback when Docker/Testcontainers are available: `pnpm run db:migrations:rollback-check`
  - API contract/client checks: `pnpm run api:contracts:check`, `pnpm run api:clients:check`, `pnpm run api:openapi:lint`
  - GitHub workflow edits: `pnpm run ci:workflows:check`
- Security-sensitive changes: `pnpm run test:security:secrets` and targeted SAST/security checks when relevant.

If a validation command cannot run because of missing credentials, Docker, network, or environment support, report the blocker and run the closest safe local checks instead.

## Frontend, design, and route smoke checks

- Vite frontend apps are `admin-app`, `user-app`, and `landing-app`; keep route/app wiring inside the owning app and shared UI/state in `libs/frontend/**`.
- Respect Feature-Sliced Design boundaries and run `pnpm run frontend:fsd:check` for frontend structure/import changes.
- Use Storybook for shared UI/design work:
  - dev: `pnpm run storybook`
  - build: `pnpm run storybook:build`
  - interaction tests: `pnpm run test:storybook`
  - visual tests: `pnpm run test:visual` or `pnpm run test:visual:update` when intentionally updating baselines
- For built frontend smoke coverage, use the tooling commands registered by `@repo/tooling`, including `testing frontend-static-smoke` and `testing frontend-browser-e2e-coverage` where appropriate.
- Frontend UX/design rewrites should follow the UI/UX Pro Max + LazyWeb workflow documented in the frontend design docs and keep generated design research under `.lazyweb/design-research/**` only when that workflow is explicitly used.

## Testing rules

- Add or update focused tests for bug fixes and new behavior when practical. Prefer regression tests that fail before the fix and pass after it.
- Use existing test runners, fixtures, factories, and naming conventions. Do not introduce a new framework when Vitest, Storybook, Playwright, Nx, or `@repo/tooling` already covers the need.
- Keep tests close to the changed project. Broaden to affected shared libraries/apps when public APIs, aliases, contracts, or cross-runtime behavior change.
- CI status is extra evidence only; local sandbox validation remains required for code changes.
