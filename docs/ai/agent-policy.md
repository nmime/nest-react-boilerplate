# AI Agent Policy

This document holds the detailed repository policy for AI coding agents. The
root [AGENTS.md](../../AGENTS.md) stays short so every agent can load it quickly;
non-trivial implementation, review, CI, docs, or release work should read this
file as the next policy layer.

## Repository And Safety Rules

- Work only in `nmime/nest-react-boilerplate` unless a maintainer explicitly
  assigns another repository.
- Verify the target repo, branch, and current `main` SHA before edits, commits,
  pushes, or deployment work.
- Use Node.js `>=24 <25` and pnpm `11.11.0`
  (`packageManager: pnpm@11.11.0`). Prefer Corepack and
  `pnpm install --frozen-lockfile`.
- Do not expose secrets, tokens, real `.env*` values, Docker secret files,
  credentials, or full environment dumps in logs, diffs, issues, PRs, generated
  docs, or final reports.
- Do not deploy, publish packages/images, rotate credentials, run destructive
  database commands, or spend funds unless a maintainer explicitly requests it
  for the current task.
- Do not use Copilot, copilor, Cursor, or any external AI coding assistant. Do
  the assigned work directly with the repository and approved tools.
- Read existing docs, configs, tests, and public APIs before editing. Do not
  create contradictory instructions or compatibility shims.
- Keep changes scoped. Do not edit generated artifacts
  (`apps/backend/*/*-app-api/contracts/openapi/**`, generated clients,
  snapshots, lockfiles) unless the task requires regenerating them.

## Commit, Merge, And Branch Policy

- Every commit that must preserve repository ownership must use author and
  committer exactly `nmime <66474195+nmime@users.noreply.github.com>`.
- Configure both author and committer explicitly before committing; verify with
  `git show --format=fuller --no-patch HEAD`.
- Do not add `Co-authored-by`, `Signed-off-by`, Splox, Executor, bot,
  automation, or assistant trailers.
- Do not use GitHub web merge, web squash, API merge, or API squash for
  author-sensitive work. Use raw git branch commits and pushes with
  authenticated credentials.
- Do not force-push `main`. Create focused topic branches from current `main`
  and leave integration to the assigned maintainer or consolidator.

## Request Context (CLS)

The repository uses Node.js built-in `AsyncLocalStorage` for request-scoped
context. There is **no** `nestjs-cls` or third-party CLS dependency.

- **Package**: `@app/backend-common-bootstrap`
  (`libs/backend/common/bootstrap/lib`).
- **Import and usage**:

  ```ts
  import { requestContext } from '@app/backend-common-bootstrap';

  // Get the current request ID
  const requestId = requestContext.getRequestId();

  // Set a value on the current request context
  requestContext.set('myKey', myValue);

  // Get a value from the current request context
  const value = requestContext.get('myKey');
  ```

- The `requestContext` helper is automatically bound to the current async scope
  by the bootstrap middleware. Do not manually create or manage `AsyncLocalStorage`
  instances; always use `requestContext` from `@app/backend-common-bootstrap`.
- Use `requestContext.getRequestId()` for correlation IDs in logs, tracing, and
  error reporting.
- Do not add `nestjs-cls`, `cls-hooked`, or any third-party CLS package. The
  project relies exclusively on Node's native `AsyncLocalStorage`.

## Exception System (RFC 9457)

The repository implements RFC 9457 Problem Details for HTTP API errors.
All exceptions flow through the `@app/backend-common-exception` library.

- **Package**: `@app/backend-common-exception`
  (`libs/backend/common/exception/lib`, Nx project `@app/backend-common-exception`).

- **Creating exceptions**:

  ```ts
  import { Exception, ExceptionKind } from '@app/backend-common-exception';

  export class MyCustomException extends Exception({
    name: 'MyCustomError',
    kind: ExceptionKind.Client,
    problemType: 'my_custom_error',
    title: 'My Custom Error',
    detail: 'What went wrong and why.',
    status: 400,
  }) {}

  throw new MyCustomException({ meta: { operation: 'example' } });
  ```

- **Domain exception classes** (pre-configured for common HTTP error codes):

  | Class                       | HTTP Status | ExceptionKind | Typical use                       |
  | --------------------------- | ----------- | ------------- | --------------------------------- |
  | `ResourceNotFoundException` | 404         | `Client`      | Entity or resource not found      |
  | `UnauthorizedException`     | 401         | `Client`      | Missing or invalid authentication |
  | `ForbiddenException`        | 403         | `Client`      | Authenticated but no permission   |
  | `ConflictException`         | 409         | `Client`      | Resource conflict / duplicate     |
  | `BadRequestException`       | 400         | `Client`      | Invalid input / validation fail   |
  | `InternalException`         | 500         | `Server`      | Unexpected server error           |

  Usage:

  ```ts
  import { ResourceNotFoundException } from '@app/backend-common-exception';

  throw new ResourceNotFoundException('user', userId);
  ```

- **Wire format**: All exceptions serialize to RFC 9457 Problem Details
  (`application/problem+json`) with standard fields: `type`, `title`, `status`,
  `detail`, `instance`, and optional validation `errors[]` (each with `detail`
  and `pointer`).

- **Anti-patterns — these do not exist in the codebase**:
  - There is **no** `AppHttpException` class. Do not import or reference it.
  - There is **no** `BaseExceptionInput` interface. Use the `Exception` constructor options directly.
  - There is **no** `ProblemDetailsInput` interface. The `Exception` factory handles RFC 9457 serialization.
  - There is **no** `nestjs-cls` dependency. CLS is provided by Node's built-in `AsyncLocalStorage` through `@app/backend-common-bootstrap`.

- Do not add project-owned problem wrapper layers when the existing exception,
  validation, and response libraries cover the need.

## Monorepo Layout

- Backend deployables live under `apps/backend/<scope>/**`, so APIs, consumers,
  workers, schedulers, and other backend runtimes stay beside their feature
  scope. This repo does not use a top-level `services/` tree.
- Frontend deployables live under `apps/frontend/**`. Current renderers are Vite
  React SPAs for `admin-app` and `user-app`, Astro + React islands for
  `landing-app`, Vike + React SSR for `site-app`, and Expo/React Native for
  `mobile-app`.
- Backend common libraries live under `libs/backend/common/**`.
- Backend feature libraries live under
  `libs/backend/feature/<scope>/<layer>/lib/**`; bot libraries are feature
  libraries such as `libs/backend/feature/discord/bot/lib` and
  `libs/backend/feature/telegram/bot/lib`.
- Backend shared PostgreSQL infrastructure lives under
  `libs/backend/postgres/main/shared/lib`; feature-owned persistence lives under
  `libs/backend/postgres/main/<scope>/lib`.
- Frontend-only libraries live under `libs/frontend/**`. Use
  `@app/frontend-ui-web` for shared React DOM UI, `@app/frontend-ui-native` for
  Tamagui/native UI, `@app/frontend-runtime` for non-visual frontend runtime,
  `@app/frontend-api-support` for browser-safe request plumbing, and
  `@app/frontend-api-client` for generated API wrappers. `@app/frontend-ui` is a
  compatibility facade only.
- True cross-runtime common libraries live under `libs/common/**`.
- Admin feature shared code is split by runtime. Do not recreate an unsplit
  shared admin project:
  - Frontend admin shared lives at `libs/frontend/feature/admin/shared/lib`,
    uses alias `@app/frontend-feature-admin-shared`, and carries
    `platform:frontend`, `type:feature-shared`, `scope:admin`, and
    `fsd:layer:shared` tags.
  - Backend admin shared lives at `libs/backend/feature/admin/shared/lib`, uses
    alias `@app/backend-feature-admin-shared`, and carries `platform:backend`,
    `type:feature-shared`, and `scope:admin` tags.
  - Respect platform boundaries: frontend code must not import backend admin
    libraries, and backend code must not import frontend admin libraries.
- Public package/path aliases in `tsconfig.base.json` are stable public API. Do
  not rename, remove, or repoint aliases unless the task explicitly includes an
  alias migration and all consumers/docs are updated.
- Exception foundation is singular: use `@app/backend-common-exception`, path
  `libs/backend/common/exception/lib`, Nx project
  `@app/backend-common-exception`. Do not introduce or document an `exceptions`
  alias/path.
- RFC 9457 Problem Details wire terms are intentional and allowed:
  `ProblemDetails`, `application/problem+json`, `urn:problem:*`, `type`,
  `title`, `status`, `detail`, `instance`, and validation `errors[]` entries
  with `detail`/`pointer`. Do not add project-owned problem wrapper layers when
  the existing exception, validation, and response libraries cover the need.
- Shared health uses `@app/backend-common-health` (`BaseHealthController`,
  `HealthService`, app-specific health providers/config) for `/health`,
  `/health/private`, `/live`, and `/ready`; document exact response shapes from
  source/tests before changing docs.

## API Contracts And Generated Artifacts

- Nest controllers and DTOs are the source of truth for API shape.
- Committed OpenAPI producer output lives under
  `apps/backend/*/*-app-api/contracts/openapi/*.json`.
- Shared generated contract review types live under
  `libs/common/api-contracts/lib/src/generated`.
- Generated frontend clients live under `libs/frontend/api-client/lib/src/generated`
  and wrappers in `libs/frontend/api-client` keep endpoint paths out of app code.
- Do not invent top-level contract directories or alternate OpenAPI consumer
  locations.
- Treat generated files as read-only unless the task explicitly includes source
  changes plus regeneration. When regeneration is required, update source first,
  run the repository generator/check commands, and commit source plus generated
  diffs together.

## Architecture And Docs To Follow

- Architecture and split details: [docs/architecture.md](../architecture.md).
- AI context map and retrieval policy:
  [docs/ai/repo-map.md](repo-map.md), [docs/ai/retrieval-policy.md](retrieval-policy.md),
  [docs/ai/context-packing.md](context-packing.md), and
  [docs/ai/agent-workflows.md](agent-workflows.md).
- Supported commands and project aliases: [docs/command-matrix.md](../command-matrix.md).
- Local verification: [docs/local-verification.md](../local-verification.md).
- Testing strategy: [docs/testing.md](../testing.md) and
  [docs/testing/modern-qa.md](../testing/modern-qa.md).
- Frontend FSD boundaries: [docs/frontend-fsd.md](../frontend-fsd.md).
- Frontend state rules: [docs/frontend-state.md](../frontend-state.md).
- UI/UX/design workflow:
  [docs/frontend-uiux-pro-max-lazyweb.md](../frontend-uiux-pro-max-lazyweb.md),
  [docs/frontend-ux.md](../frontend-ux.md), and
  [docs/agent-skills.md](../agent-skills.md).
- Database migrations: [docs/database-migrations.md](../database-migrations.md).
- API contract lifecycle: [docs/api-contracts.md](../api-contracts.md),
  [docs/api-conventions.md](../api-conventions.md), and
  [docs/api-lifecycle-policy.md](../api-lifecycle-policy.md).

## Validation Expectations

Pick the smallest command set that proves the change, then broaden when touching
shared/public APIs.

- Always run formatting or at least whitespace checks for edited Markdown/docs:
  - `pnpm exec prettier --check <files>` when dependencies are available.
  - a local Markdown link check when no repository docs-link script exists.
  - grep gates for stale RFC/problem/exception-library wording when touching
    API, architecture, or AI guidance docs.
  - `git diff --check` for every change.
- General code changes:
  - `pnpm run format:check` or `pnpm run format:changed`
  - `pnpm run lint`
  - `pnpm run typecheck`
  - relevant `pnpm run test`/Nx project tests
- Fast broad gate for normal PRs: `pnpm run check:fast`.
- Full non-runtime gate when contract, tooling, or public API surfaces are
  affected: `pnpm run check`.
- Library config changes: `pnpm run lib:configs:check`.
- Tooling changes under `packages/tooling/**`: `pnpm run tooling:static-check`.
- Database/API/workflow changes:
  - migrations: `pnpm run db:migrations:check`
  - rollback when Docker/Testcontainers are available:
    `pnpm run db:migrations:rollback-check`
  - API contract/client checks: `pnpm run api:contracts:check`,
    `pnpm run api:clients:check`, `pnpm run api:openapi:lint`
  - GitHub workflow edits: `pnpm run ci:workflows:check`
- Security-sensitive changes: `pnpm run test:security:secrets` and targeted
  SAST/security checks when relevant.

If a validation command cannot run because of missing credentials, Docker,
network, or environment support, report the blocker and run the closest safe
local checks instead.

## Frontend, Design, And Route Smoke Checks

- Frontend apps are `admin-app`, `user-app`, `landing-app`, `site-app`, and
  `mobile-app`; keep route/app wiring inside the owning app and shared UI/state
  in `libs/frontend/**`.
- Respect Feature-Sliced Design boundaries and run
  `pnpm run frontend:fsd:check` for frontend structure/import changes.
- Use Storybook for shared UI/design work:
  - dev: `pnpm run storybook`
  - build: `pnpm run storybook:build`
  - interaction tests: `pnpm run test:storybook`
  - visual tests: `pnpm run test:visual` or `pnpm run test:visual:update` when
    intentionally updating baselines
- For built frontend smoke coverage, use the tooling commands registered by
  `@repo/tooling`, including `testing frontend-static-smoke` and
  `testing frontend-browser-e2e-coverage` where appropriate.
- Frontend UX/design rewrites should follow the UI/UX Pro Max + LazyWeb workflow
  documented in the frontend design docs and keep generated design research
  under `.lazyweb/design-research/**` only when that workflow is explicitly used.

## Testing Rules

- Add or update focused tests for bug fixes and new behavior when practical.
  Prefer regression tests that fail before the fix and pass after it.
- Use existing test runners, fixtures, factories, and naming conventions. Do not
  introduce a new framework when Vitest, Storybook, Playwright, Nx, or
  `@repo/tooling` already covers the need.
- Keep tests close to the changed project. Broaden to affected shared
  libraries/apps when public APIs, aliases, contracts, or cross-runtime behavior
  change.
- CI status is extra evidence only; local sandbox validation remains required
  for code changes.
